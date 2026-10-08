//! ICC profiles through the A-Studio colour engine ([`crate::cms`], decision D8): built-in RGB
//! spaces and user-supplied `.icc` files, and the profiles exports embed ([`encode`]), written in
//! code from the CMS. (VectorCraft did this through moxcms; the engine replaces it unchanged in
//! behaviour: same intents, no black point compensation.)

use std::sync::{Arc, OnceLock};

use crate::cms::{self, Builtin, Clut, ColorSpace, Pcs, Profile, ProfileClass, Transform, synth};

use super::{CmsError, Intent, ProfileKind, lab};

fn engine_intent(i: Intent) -> cms::Intent {
    match i {
        Intent::Perceptual => cms::Intent::Perceptual,
        Intent::RelativeColorimetric => cms::Intent::RelativeColorimetric,
        Intent::Saturation => cms::Intent::Saturation,
        Intent::AbsoluteColorimetric => cms::Intent::AbsoluteColorimetric,
    }
}

const INTENTS: [Intent; 4] = [Intent::Perceptual, Intent::RelativeColorimetric, Intent::Saturation, Intent::AbsoluteColorimetric];

fn intent_index(i: Intent) -> usize {
    INTENTS.iter().position(|x| *x == i).unwrap_or(1)
}

type Xf = Option<Arc<Transform>>;

/// A parsed ICC profile plus lazily-built transforms to/from sRGB.
pub struct IccProfile {
    pub name: String,
    pub kind: ProfileKind,
    /// The file it was loaded from (empty for profiles made in code).
    source: Vec<u8>,
    profile: Profile,
    to_srgb: [OnceLock<Xf>; 4],
    from_srgb: [OnceLock<Xf>; 4],
}

impl std::fmt::Debug for IccProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("IccProfile").field("name", &self.name).field("kind", &self.kind).finish()
    }
}

impl IccProfile {
    pub fn from_profile(name: Option<String>, profile: Profile) -> Result<Self, CmsError> {
        let kind = match profile.color_space {
            ColorSpace::Rgb => ProfileKind::Rgb,
            ColorSpace::Cmyk => ProfileKind::Cmyk,
            ColorSpace::Gray => ProfileKind::Gray,
            other => return Err(CmsError::Unsupported(format!("profile colour space {other:?} is not RGB, CMYK or Gray"))),
        };
        let description = profile.description.trim_matches(char::from(0)).trim();
        let name = name.or_else(|| (!description.is_empty()).then(|| description.to_string())).unwrap_or_else(|| format!("Untitled {kind:?} profile"));
        Ok(Self { name, kind, source: Vec::new(), profile, to_srgb: Default::default(), from_srgb: Default::default() })
    }

    pub fn from_bytes(name: Option<String>, bytes: &[u8]) -> Result<Self, CmsError> {
        let p = Profile::parse(bytes).map_err(|e| CmsError::BadProfile(format!("{e:?}")))?;
        Ok(Self { source: bytes.to_vec(), ..Self::from_profile(name, p)? })
    }

    /// The profile as an ICC file: the bytes it was loaded from, else encoded.
    pub fn bytes(&self) -> Result<Vec<u8>, CmsError> {
        if self.source.is_empty() { encode(&self.profile) } else { Ok(self.source.clone()) }
    }

    fn channels(&self) -> usize {
        match self.kind {
            ProfileKind::Cmyk => 4,
            ProfileKind::Gray => 1,
            ProfileKind::Rgb => 3,
        }
    }

    fn to_xf(&self, intent: Intent) -> Xf {
        let cell = self.to_srgb.get(intent_index(intent))?;
        cell.get_or_init(|| Transform::new(&self.profile, Builtin::Srgb.profile(), engine_intent(intent), false).ok().map(Arc::new)).clone()
    }

    fn inverse_xf(&self, intent: Intent) -> Xf {
        let cell = self.from_srgb.get(intent_index(intent))?;
        cell.get_or_init(|| Transform::new(Builtin::Srgb.profile(), &self.profile, engine_intent(intent), false).ok().map(Arc::new)).clone()
    }

    /// Device values (RGB / CMYK / Gray, 0..1) → sRGB.
    pub fn to_srgb(&self, v: &[f32], intent: Intent) -> Option<[f32; 3]> {
        let xf = self.to_xf(intent)?;
        let mut src = v.to_vec();
        src.resize(self.channels(), 0.0);
        let mut dst = [0.0f32; 3];
        xf.eval(&src, &mut dst);
        dst.iter().all(|x| x.is_finite()).then(|| dst.map(|x| x.clamp(0.0, 1.0)))
    }

    /// sRGB → device values.
    pub fn from_srgb(&self, rgb: [f32; 3], intent: Intent) -> Option<Vec<f32>> {
        let xf = self.inverse_xf(intent)?;
        let mut dst = vec![0.0f32; self.channels()];
        xf.eval(&rgb, &mut dst);
        dst.iter().all(|x| x.is_finite()).then(|| dst.into_iter().map(|x| x.clamp(0.0, 1.0)).collect())
    }

    /// Whether transforms can be built for this profile (checked at registration).
    pub fn usable(&self) -> bool {
        self.to_xf(Intent::RelativeColorimetric).is_some() && self.inverse_xf(Intent::RelativeColorimetric).is_some()
    }
}

/// The built-in RGB space `name`, from the engine's built-in profiles.
fn rgb_space(name: &str) -> Option<Profile> {
    let b = match name {
        super::WIDE_GAMUT_RGB => Builtin::AdobeRgbCompat,
        super::DISPLAY_P3 => Builtin::DisplayP3,
        super::PROPHOTO_RGB => Builtin::ProPhotoCompat,
        super::SRGB => Builtin::Srgb,
        _ => return None,
    };
    Some(b.profile().clone())
}

/// Built-in RGB working spaces from the engine's standard primaries.
pub fn builtin_rgb(name: &str) -> Option<IccProfile> {
    IccProfile::from_profile(Some(name.to_string()), rgb_space(name)?).ok()
}

/// Built-in RGB space `name` as an ICC file, under its name here.
pub(super) fn builtin_rgb_bytes(name: &str) -> Result<Vec<u8>, CmsError> {
    encode(&labelled(rgb_space(name).ok_or_else(|| CmsError::UnknownProfile(name.into()))?, name))
}

/// Encode `p` as an ICC file (ICC v4; the engine writes a fixed creation date, so exports are
/// reproducible).
pub(super) fn encode(p: &Profile) -> Result<Vec<u8>, CmsError> {
    Ok(p.to_bytes().to_vec())
}

/// Profiles made here carry their name and no copyright claim.
fn labelled(mut p: Profile, name: &str) -> Profile {
    p.description = name.to_string();
    p.copyright = "No copyright, use freely".to_string();
    p.with_encoded_bytes()
}

/// Grid points per input channel of the CMYK → Lab table and of the Lab → CMYK table.
const A2B_GRID: usize = 9;
const B2A_GRID: usize = 17;

/// A CMYK output profile sampled from a conversion: `to_lab` (CMYK → media-relative Lab) in a
/// 9⁴ table, `from_lab` (Lab → CMYK, gamut-mapped) in a 17³ table, Lab PCS.
pub(super) fn cmyk_profile(name: &str, to_lab: impl Fn([f32; 4]) -> lab::Lab, from_lab: impl Fn(lab::Lab) -> [f32; 4]) -> Profile {
    let a2b = Clut::sample(vec![A2B_GRID; 4], 3, |inp, out| {
        let cmyk = [0, 1, 2, 3].map(|i| inp.get(i).copied().unwrap_or(0.0));
        let l = to_lab(cmyk);
        let enc = synth::encode_v2([l.l as f64, l.a as f64, l.b as f64]);
        for (o, e) in out.iter_mut().zip(enc) {
            *o = e;
        }
    });
    let b2a = Clut::sample(vec![B2A_GRID; 3], 4, |inp, out| {
        let [l, a, b] = synth::decode_v2([0, 1, 2].map(|i| inp.get(i).copied().unwrap_or(0.0) as f64));
        let cmyk = from_lab(lab::Lab::new(l as f32, a as f32, b as f32));
        for (o, c) in out.iter_mut().zip(cmyk) {
            *o = c.clamp(0.0, 1.0);
        }
    });
    let (a2b, b2a) = (synth::lut16(a2b), synth::lut16(b2a));
    let p = Profile {
        version: (4, 0x30),
        class: ProfileClass::Output,
        color_space: ColorSpace::Cmyk,
        pcs: Pcs::Lab,
        rendering_intent: cms::Intent::RelativeColorimetric,
        description: String::new(),
        copyright: String::new(),
        white_point: cms::math::d50_quantized(),
        black_point: None,
        chad: None,
        matrix: None,
        trc: None,
        gray_trc: None,
        a2b: [Some(a2b.clone()), Some(a2b.clone()), Some(a2b)],
        b2a: [Some(b2a.clone()), Some(b2a.clone()), Some(b2a)],
        bytes: None,
        hash: Default::default(),
    };
    labelled(p, name)
}

/// The grey space of greyscale exports: sRGB's tone curve, D50 white.
pub(super) fn gray_profile(name: &str) -> Profile {
    labelled(Builtin::SGray.profile().clone(), name)
}
