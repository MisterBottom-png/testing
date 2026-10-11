//! P3-06: the built-in profiles carry A-Studio's names, and the names PhotoCraft and VectorCraft
//! gave them still find the same profiles, so older files and settings keep their colours.
// Integration tests: unwrapping and panicking on failure is fine here, unlike in shipped code.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::cms::builtin::COPYRIGHT;
use astudio_color::cms::synth::{DESCRIPTION, OLD_DESCRIPTION};
use astudio_color::cms::{Builtin, Intent, Transform};
use astudio_color::vector::cms::{self, Cms, ColorSettings, GENERIC_CMYK};

#[test]
fn builtin_profiles_name_a_studio() {
    for b in Builtin::ALL {
        let d = b.description();
        assert!(!d.to_ascii_lowercase().contains("photocraft"), "{d}");
        let p = b.profile();
        assert_eq!(p.description, d);
        assert_eq!(Builtin::from_id(d), Some(b));
    }
    let coated = Builtin::CoatedCmyk.profile();
    assert_eq!((coated.description.as_str(), coated.copyright.as_str()), (DESCRIPTION, COPYRIGHT));
    assert!(!COPYRIGHT.contains("photocraft") && cms::GENERIC_CMYK.starts_with("A-Studio"));
}

#[test]
fn old_profile_names_find_the_same_profiles() {
    for (old, b) in [
        ("Linear sRGB (Photocraft)", Builtin::LinearSrgb),
        ("Adobe RGB (1998)-compatible (Photocraft)", Builtin::AdobeRgbCompat),
        ("ProPhoto RGB-compatible (ROMM primaries, Photocraft)", Builtin::ProPhotoCompat),
        ("Rec. ITU-R BT.2020 (Photocraft)", Builtin::Rec2020),
        ("Gray Gamma 2.2 (Photocraft)", Builtin::GrayGamma22),
        ("sGray (sRGB tone curve, Photocraft)", Builtin::SGray),
        ("Lab D50 identity (Photocraft)", Builtin::LabD50),
        (OLD_DESCRIPTION, Builtin::CoatedCmyk),
        ("photocraft-coated-cmyk", Builtin::CoatedCmyk),
    ] {
        assert_eq!(Builtin::from_id(old), Some(b), "{old}");
    }
}

#[test]
fn the_renamed_default_cmyk_profile_converts_exactly_as_before() {
    // Lab (ICC 0..1 encoding) PhotoCraft's `photocraft-coated-cmyk.icc` gives for these inks,
    // relative colorimetric: only the profile's name and copyright text changed (P3-06), so the
    // shipped tables must give the same numbers.
    let t = Transform::new(Builtin::CoatedCmyk.profile(), Builtin::LabD50.profile(), Intent::RelativeColorimetric, false).unwrap();
    for (cmyk, lab) in [
        ([0.0f32, 0.0, 0.0, 0.0], [1.0f32, 0.5019608, 0.5019608]),
        ([1.0, 0.0, 0.0, 0.0], [0.5819853, 0.35032168, 0.3043505]),
        ([0.2, 0.7, 0.4, 0.1], [0.46377146, 0.65021443, 0.55710787]),
        ([0.0, 0.0, 0.0, 1.0], [0.1744179, 0.5019608, 0.5043045]),
        ([0.6, 0.3, 0.9, 0.25], [0.38200057, 0.44566482, 0.59363514]),
    ] {
        let mut o = [0f32; 3];
        t.eval(&cmyk, &mut o);
        assert!(o.iter().zip(lab).all(|(a, b)| (a - b).abs() < 1e-6), "{cmyk:?}: {o:?} vs {lab:?}");
    }
}

#[test]
fn vectorcraft_generic_cmyk_still_names_the_same_press_model() {
    let old = "VectorCraft Generic CMYK (SWOP-like)";
    assert_eq!(cms::canonical_name(old), GENERIC_CMYK);
    assert_eq!(cms::profile(old).map(|p| p.name), Some(GENERIC_CMYK.to_string()));
    let by_old = Cms::new(&ColorSettings { cmyk: old.into(), ..ColorSettings::default() }).unwrap();
    let by_new = Cms::new(&ColorSettings { cmyk: GENERIC_CMYK.into(), ..ColorSettings::default() }).unwrap();
    for rgb in [[1.0, 0.0, 0.0], [0.2, 0.6, 0.9], [0.5, 0.5, 0.5]] {
        assert_eq!(by_old.srgb_to_cmyk(rgb, cms::Intent::RelativeColorimetric), by_new.srgb_to_cmyk(rgb, cms::Intent::RelativeColorimetric));
    }
    assert_eq!(cms::icc_bytes(old).unwrap(), cms::icc_bytes(GENERIC_CMYK).unwrap());
}
