//! Structural invariants for documents (vc `invariants`; the native-format round trip since
//! P3-12; the session and SVG round-trip checks come with the engine, P3-16).

use std::collections::HashSet;

use astudio_vdoc::{Document, NodeKind};
use serde_json::Value;

/// Serialize a document to JSON (the canonical form for equality checks).
pub fn doc_json(doc: &Document) -> Value {
    serde_json::to_value(doc).expect("document serializes")
}

/// Tree invariants: ids unique, `node_count` equals the number of walked nodes, `next_id` above
/// every id, top level made of layers, layers only at the top or inside layers, clip groups have
/// a first child, compound children are paths.
pub fn check_document(doc: &Document) -> Result<(), String> {
    let mut seen = HashSet::new();
    let mut walked = 0usize;
    let mut max = 0u64;
    let mut err = None;
    doc.walk(|n| {
        walked += 1;
        max = max.max(n.id.0);
        if !seen.insert(n.id) && err.is_none() {
            err = Some(format!("duplicate id {}", n.id));
        }
        match &n.kind {
            NodeKind::Group { children, .. } if children.iter().any(|c| c.is_layer()) && err.is_none() => {
                err = Some(format!("group {} contains a layer", n.id));
            }
            NodeKind::Compound { children, .. } if children.iter().any(|c| !matches!(c.kind, NodeKind::Path { .. })) && err.is_none() => {
                err = Some(format!("compound {} has a non-path child", n.id));
            }
            _ => {}
        }
        if !(n.opacity.is_finite() && (0.0..=1.0).contains(&n.opacity)) && err.is_none() {
            err = Some(format!("node {} opacity {}", n.id, n.opacity));
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    if walked != doc.node_count() {
        return Err(format!("node_count {} != walked {walked}", doc.node_count()));
    }
    if doc.peek_next_id() <= max {
        return Err(format!("next_id {} <= max id {max}", doc.peek_next_id()));
    }
    if let Some(l) = doc.layers.iter().find(|l| !l.is_layer()) {
        return Err(format!("top-level node {} is not a layer", l.id));
    }
    for id in seen {
        if doc.node(id).is_none() {
            return Err(format!("walked id {id} not found by lookup"));
        }
    }
    Ok(())
}

/// `.vectorcraft` save → load → the JSON of the document and of what loaded, without `images`: a
/// save keeps only the images in use, which must come back byte for byte.
fn native_roundtrip(doc: &Document) -> Result<(Value, Value), String> {
    let bytes = astudio_format::vectorcraft::save(doc, false);
    let back = astudio_format::vectorcraft::load(&bytes).map_err(|e| format!("load: {e}"))?;
    if let Some(k) = back.images.iter().find(|(k, b)| doc.images.get(*k).map(|d| &d.bytes) != Some(&b.bytes)).map(|(k, _)| k) {
        return Err(format!("native round trip changed image `{k}`"));
    }
    let mut lost = None;
    back.walk(|n| {
        if let NodeKind::Image(im) = &n.kind
            && doc.images.contains_key(&im.key)
            && !back.images.contains_key(&im.key)
        {
            lost = Some(im.key.clone());
        }
    });
    if let Some(k) = lost {
        return Err(format!("native round trip lost image `{k}`, which is in use"));
    }
    let strip = |mut v: Value| {
        if let Some(o) = v.as_object_mut() {
            o.remove("images");
        }
        v
    };
    Ok((strip(doc_json(doc)), strip(doc_json(&back))))
}

/// `.vectorcraft` save → load must reproduce the document (numbers compared to 1e-12 relative —
/// see [`check_native_roundtrip_exact`] for the bit-exact version).
pub fn check_native_roundtrip(doc: &Document) -> Result<(), String> {
    let (a, b) = native_roundtrip(doc)?;
    if !json_approx_eq(&a, &b, 1e-12) {
        return Err(format!("native round trip differs:\n{}", first_diff(&a, &b, "$")));
    }
    Ok(())
}

/// Bit-exact `.vectorcraft` round trip (every f64 must survive).
pub fn check_native_roundtrip_exact(doc: &Document) -> Result<(), String> {
    let (a, b) = native_roundtrip(doc)?;
    if a != b {
        return Err(format!("native round trip differs:\n{}", first_diff(&a, &b, "$")));
    }
    Ok(())
}

/// Structural JSON equality with numbers compared to `rel` relative tolerance.
pub fn json_approx_eq(a: &Value, b: &Value, rel: f64) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => match (x.as_f64(), y.as_f64()) {
            (Some(x), Some(y)) => x == y || (x - y).abs() <= rel * x.abs().max(y.abs()),
            _ => x == y,
        },
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| json_approx_eq(p, q, rel)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| json_approx_eq(v, w, rel))),
        _ => a == b,
    }
}

/// A short description of the first difference between two JSON values.
pub fn first_diff(a: &Value, b: &Value, path: &str) -> String {
    match (a, b) {
        (Value::Object(x), Value::Object(y)) => {
            for (k, v) in x {
                match y.get(k) {
                    None => return format!("{path}.{k}: missing on right"),
                    Some(w) if w != v => return first_diff(v, w, &format!("{path}.{k}")),
                    _ => {}
                }
            }
            for k in y.keys() {
                if !x.contains_key(k) {
                    return format!("{path}.{k}: missing on left");
                }
            }
            format!("{path}: equal")
        }
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return format!("{path}: array length {} vs {}", x.len(), y.len());
            }
            for (i, (v, w)) in x.iter().zip(y).enumerate() {
                if v != w {
                    return first_diff(v, w, &format!("{path}[{i}]"));
                }
            }
            format!("{path}: equal")
        }
        _ => format!("{path}: {a} vs {b}"),
    }
}
