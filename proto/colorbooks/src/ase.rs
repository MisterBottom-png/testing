//! ASE (Adobe Swatch Exchange): the swatch file printers, brand guides and most design tools
//! exchange. Written from the public description of the format, not from any vendor code.
//!
//! Layout (all integers and floats big-endian):
//!
//! ```text
//! "ASEF"  u16 major (1)  u16 minor (0)  u32 block count
//! block:  u16 type  u32 length  [body of `length` bytes]
//!   type 0xC001 group start: name
//!   type 0xC002 group end:   (empty)
//!   type 0x0001 colour:      name, 4-byte model ("RGB ", "CMYK", "LAB ", "Gray"),
//!                            f32 values (3, 4, 3 or 1), u16 kind (0 global, 1 spot, 2 normal)
//! name:   u16 length in UTF-16 units including the final 0, then UTF-16BE text
//! ```
//!
//! Lab values are stored as L 0..1 (that is, L divided by 100), a and b as -128..127. The reader
//! caps names and block counts so a damaged file is refused instead of exhausting memory.

/// Longest swatch name (UTF-16 units) and most blocks a file may hold.
pub const MAX_NAME: usize = 1024;
pub const MAX_BLOCKS: usize = 200_000;

/// A colour in its ASE model.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Model {
    Rgb([f32; 3]),
    Cmyk([f32; 4]),
    /// L 0..100, a and b about -128..127.
    Lab([f32; 3]),
    Gray(f32),
}

/// What kind of swatch a colour is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Global,
    Spot,
    Normal,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub name: String,
    pub model: Model,
    pub kind: Kind,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Group {
    pub name: String,
    pub colors: Vec<Entry>,
}

/// An ASE file: ungrouped colours and named groups.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct File {
    pub colors: Vec<Entry>,
    pub groups: Vec<Group>,
}

const MAGIC: &[u8; 4] = b"ASEF";
const GROUP_START: u16 = 0xC001;
const GROUP_END: u16 = 0xC002;
const COLOR: u16 = 0x0001;

/// Is `bytes` an ASE file?
pub fn sniff(bytes: &[u8]) -> bool {
    bytes.starts_with(MAGIC)
}

struct Cursor<'a> {
    b: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let end = self.pos.checked_add(n).ok_or("length overflow")?;
        let s = self.b.get(self.pos..end).ok_or("file ends early")?;
        self.pos = end;
        Ok(s)
    }
    fn u16(&mut self) -> Result<u16, String> {
        let s = self.take(2)?;
        Ok(u16::from_be_bytes([s[0], s[1]]))
    }
    fn u32(&mut self) -> Result<u32, String> {
        let s = self.take(4)?;
        Ok(u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn f32(&mut self) -> Result<f32, String> {
        let s = self.take(4)?;
        let v = f32::from_be_bytes([s[0], s[1], s[2], s[3]]);
        if v.is_finite() { Ok(v) } else { Err("non-finite value".into()) }
    }
    fn name(&mut self) -> Result<String, String> {
        let units = self.u16()? as usize;
        if units > MAX_NAME {
            return Err(format!("name longer than {MAX_NAME} characters"));
        }
        let raw = self.take(units * 2)?;
        let u: Vec<u16> = raw.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        let text: String = char::decode_utf16(u.iter().copied()).map(|c| c.unwrap_or(char::REPLACEMENT_CHARACTER)).collect();
        Ok(text.trim_end_matches('\0').to_string())
    }
    fn done(&self) -> bool {
        self.pos >= self.b.len()
    }
}

/// Read an ASE file.
pub fn read(bytes: &[u8]) -> Result<File, String> {
    let mut c = Cursor { b: bytes, pos: 0 };
    if c.take(4)? != MAGIC {
        return Err("not an ASE file".into());
    }
    let (major, _minor) = (c.u16()?, c.u16()?);
    if major != 1 {
        return Err(format!("ASE version {major} is not supported"));
    }
    let count = c.u32()? as usize;
    if count > MAX_BLOCKS {
        return Err(format!("more than {MAX_BLOCKS} blocks"));
    }
    let mut file = File::default();
    let mut open: Option<Group> = None;
    for _ in 0..count {
        if c.done() {
            break;
        }
        let kind = c.u16()?;
        let len = c.u32()? as usize;
        let body = c.take(len)?;
        let mut b = Cursor { b: body, pos: 0 };
        match kind {
            GROUP_START => {
                if let Some(g) = open.take() {
                    file.groups.push(g);
                }
                open = Some(Group { name: b.name()?, colors: vec![] });
            }
            GROUP_END => {
                if let Some(g) = open.take() {
                    file.groups.push(g);
                }
            }
            COLOR => {
                let name = b.name()?;
                let model = match b.take(4)? {
                    b"RGB " => Model::Rgb([b.f32()?, b.f32()?, b.f32()?]),
                    b"CMYK" => Model::Cmyk([b.f32()?, b.f32()?, b.f32()?, b.f32()?]),
                    b"LAB " => Model::Lab([b.f32()? * 100.0, b.f32()?, b.f32()?]),
                    b"Gray" => Model::Gray(b.f32()?),
                    other => return Err(format!("unknown colour model {:?}", String::from_utf8_lossy(other))),
                };
                let kind = match b.u16().unwrap_or(2) {
                    0 => Kind::Global,
                    1 => Kind::Spot,
                    _ => Kind::Normal,
                };
                let e = Entry { name, model, kind };
                match open.as_mut() {
                    Some(g) => g.colors.push(e),
                    None => file.colors.push(e),
                }
            }
            // Unknown block types are skipped (their length is known).
            _ => {}
        }
    }
    if let Some(g) = open.take() {
        file.groups.push(g);
    }
    Ok(file)
}

fn put_name(out: &mut Vec<u8>, name: &str) {
    let units: Vec<u16> = name.encode_utf16().take(MAX_NAME - 1).chain(std::iter::once(0)).collect();
    out.extend_from_slice(&(units.len() as u16).to_be_bytes());
    for u in units {
        out.extend_from_slice(&u.to_be_bytes());
    }
}

fn put_block(out: &mut Vec<u8>, kind: u16, body: &[u8]) {
    out.extend_from_slice(&kind.to_be_bytes());
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    out.extend_from_slice(body);
}

fn color_block(e: &Entry) -> Vec<u8> {
    let mut b = Vec::new();
    put_name(&mut b, &e.name);
    let values: Vec<f32> = match e.model {
        Model::Rgb(v) => {
            b.extend_from_slice(b"RGB ");
            v.to_vec()
        }
        Model::Cmyk(v) => {
            b.extend_from_slice(b"CMYK");
            v.to_vec()
        }
        Model::Lab([l, a, bb]) => {
            b.extend_from_slice(b"LAB ");
            vec![l / 100.0, a, bb]
        }
        Model::Gray(v) => {
            b.extend_from_slice(b"Gray");
            vec![v]
        }
    };
    for v in values {
        b.extend_from_slice(&v.to_be_bytes());
    }
    let kind: u16 = match e.kind {
        Kind::Global => 0,
        Kind::Spot => 1,
        Kind::Normal => 2,
    };
    b.extend_from_slice(&kind.to_be_bytes());
    b
}

/// Write an ASE file.
pub fn write(file: &File) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&1u16.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    let blocks = file.colors.len() + file.groups.iter().map(|g| g.colors.len() + 2).sum::<usize>();
    out.extend_from_slice(&(blocks as u32).to_be_bytes());
    for e in &file.colors {
        put_block(&mut out, COLOR, &color_block(e));
    }
    for g in &file.groups {
        let mut name = Vec::new();
        put_name(&mut name, &g.name);
        put_block(&mut out, GROUP_START, &name);
        for e in &g.colors {
            put_block(&mut out, COLOR, &color_block(e));
        }
        put_block(&mut out, GROUP_END, &[]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> File {
        File {
            colors: vec![Entry { name: "Paper".into(), model: Model::Gray(0.0), kind: Kind::Normal }],
            groups: vec![Group {
                name: "Inks".into(),
                colors: vec![
                    Entry { name: "PANTONE 186 C".into(), model: Model::Lab([47.5, 68.2, 43.9]), kind: Kind::Spot },
                    Entry { name: "Brand Blue".into(), model: Model::Cmyk([1.0, 0.6, 0.0, 0.1]), kind: Kind::Global },
                    Entry { name: "Ünïcode ☃".into(), model: Model::Rgb([0.1, 0.2, 0.3]), kind: Kind::Normal },
                ],
            }],
        }
    }

    #[test]
    fn round_trip_keeps_names_models_kinds_and_groups() {
        let bytes = write(&sample());
        assert!(sniff(&bytes));
        assert_eq!(&bytes[..12], b"ASEF\0\x01\0\0\0\0\0\x06");
        let back = read(&bytes).unwrap();
        assert_eq!(back.colors, sample().colors);
        assert_eq!(back.groups[0].name, "Inks");
        let inks = &back.groups[0].colors;
        assert_eq!(inks[0].kind, Kind::Spot);
        let Model::Lab([l, a, b]) = inks[0].model else { panic!("{:?}", inks[0]) };
        assert!((l - 47.5).abs() < 1e-4 && (a - 68.2).abs() < 1e-4 && (b - 43.9).abs() < 1e-4);
        assert_eq!(inks[1].model, Model::Cmyk([1.0, 0.6, 0.0, 0.1]));
        assert_eq!(inks[2].name, "Ünïcode ☃");
    }

    #[test]
    fn refuses_bad_files_without_panicking() {
        assert!(read(b"").is_err());
        assert!(read(b"ASE").is_err());
        assert!(read(b"ASEF\0\x02\0\0\0\0\0\0").is_err(), "version 2");
        assert!(read(b"ASEF\0\x01\0\0\xff\xff\xff\xff").is_err(), "too many blocks");
        // A colour block that claims more bytes than the file has.
        assert!(read(b"ASEF\0\x01\0\0\0\0\0\x01\0\x01\0\0\x10\0").is_err());
        // A name longer than the cap.
        let mut bytes = b"ASEF\0\x01\0\0\0\0\0\x01\0\x01\0\0\0\x08".to_vec();
        bytes.extend_from_slice(&0xffffu16.to_be_bytes());
        bytes.extend_from_slice(&[0; 6]);
        assert!(read(&bytes).is_err());
        // Truncated in the middle of a valid file: an error, not a crash.
        let good = write(&sample());
        for cut in [13, 20, 40, good.len() - 1] {
            let _ = read(&good[..cut]);
        }
        // Unknown block types are skipped.
        let mut bytes = b"ASEF\0\x01\0\0\0\0\0\x02".to_vec();
        bytes.extend_from_slice(&[0x77, 0x77, 0, 0, 0, 2, 9, 9]);
        bytes.extend_from_slice(&write(&sample())[12..]);
        assert_eq!(read(&bytes).unwrap().colors.len(), 1);
    }
}
