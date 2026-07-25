#!/usr/bin/env python3
"""Build the deterministic 48 kHz PCM snare bank used by the native engine."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import struct
import sys
import urllib.parse
import urllib.request
import wave
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable

import numpy as np
from remotezip import RemoteZip

SAMPLE_RATE = 48_000
LAYER_COUNT = 6
ROUND_ROBIN_COUNT = 4
ARTICULATIONS = ("center", "off_center", "edge", "rimshot", "cross_stick")
BANK_MAGIC = b"SNAREPCM"
BANK_VERSION = 1
ONSET_THRESHOLD = 10.0 ** (-60.0 / 20.0)
ONSET_FRAME = 128
MAX_FRAMES = int(SAMPLE_RATE * 1.25)
FADE_FRAMES = int(SAMPLE_RATE * 0.020)
TARGET_PEAK = 10.0 ** (-1.0 / 20.0)
AASIMONSTER_URL = "https://drumgizmo.org/kits/Aasimonster/aasimonster2_1.zip"
AASIMONSTER_MD5 = "910aa5a789d34f85c2e7c4a5c5a6b2f9"
AASIMONSTER_LICENSE = "CC BY 4.0"
FREE_WAVE_LICENSE = "Freeware, royalty-free; application embedding permitted"
CROSS_STICK_URLS = (
    "https://freewavesamples.com/files/Side-Stick.wav",
    "https://freewavesamples.com/files/Side-Stick-2.wav",
    "https://freewavesamples.com/files/Side-Stick-5.wav",
    "https://freewavesamples.com/files/Rim.wav",
)
INSTRUMENT_XML = {
    "center": "aasimonster2/snare_on_center/snare_on_center.xml",
    "off_center": "aasimonster2/snare_off_center/snare_off_center.xml",
    "rimshot": "aasimonster2/snare_rim_shot/snare_rim_shot.xml",
}


@dataclass(frozen=True)
class SourceHit:
    articulation: str
    name: str
    member: str
    power: float
    crc: int


@dataclass
class PreparedHit:
    articulation: str
    layer: int
    round_robin: int
    source: str
    source_power: float
    samples: np.ndarray


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--cache-dir", type=Path, default=Path(".snare-cache"))
    return parser.parse_args()


def decode_pcm(raw: bytes, sample_width: int) -> np.ndarray:
    if sample_width == 2:
        values = np.frombuffer(raw, dtype="<i2").astype(np.float32)
        return values / 32768.0
    if sample_width == 3:
        packed = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        values = (
            packed[:, 0].astype(np.int32)
            | (packed[:, 1].astype(np.int32) << 8)
            | (packed[:, 2].astype(np.int32) << 16)
        )
        values = np.where(values & 0x800000, values - 0x1000000, values)
        return values.astype(np.float32) / 8_388_608.0
    if sample_width == 4:
        values = np.frombuffer(raw, dtype="<i4").astype(np.float32)
        return values / 2_147_483_648.0
    raise ValueError(f"Unsupported PCM width: {sample_width} bytes")


def read_wav(data: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(data), "rb") as wav:
        if wav.getcomptype() != "NONE":
            raise ValueError(f"Compressed WAV is unsupported: {wav.getcomptype()}")
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        width = wav.getsampwidth()
        frames = wav.getnframes()
        raw = wav.readframes(frames)
    decoded = decode_pcm(raw, width).reshape(-1, channels)
    return decoded, sample_rate


def resample_linear(samples: np.ndarray, source_rate: int) -> np.ndarray:
    if source_rate == SAMPLE_RATE:
        return samples.astype(np.float32, copy=False)
    output_frames = max(1, int(round(len(samples) * SAMPLE_RATE / source_rate)))
    source_positions = np.linspace(0.0, len(samples) - 1, num=output_frames)
    source_index = np.arange(len(samples), dtype=np.float64)
    channels = [
        np.interp(source_positions, source_index, samples[:, channel])
        for channel in range(samples.shape[1])
    ]
    return np.stack(channels, axis=1).astype(np.float32)


def one_pole_low_pass(samples: np.ndarray, coefficient: float) -> np.ndarray:
    output = np.empty_like(samples)
    state = np.zeros(samples.shape[1], dtype=np.float32)
    for index in range(len(samples)):
        state += coefficient * (samples[index] - state)
        output[index] = state
    return output


def mix_aasimonster(multichannel: np.ndarray, articulation: str) -> np.ndarray:
    if multichannel.shape[1] < 11:
        raise ValueError(f"Expected at least 11 channels, got {multichannel.shape[1]}")
    oh_left = multichannel[:, 6]
    oh_right = multichannel[:, 7]
    snare_bottom = multichannel[:, 9]
    snare_top = multichannel[:, 10]

    close = snare_top * 0.82 + snare_bottom * 0.34
    room_amount = 0.10 if articulation == "center" else 0.16
    left = close * (1.0 - room_amount) + oh_left * room_amount
    right = close * (1.0 - room_amount) + oh_right * room_amount
    stereo = np.stack((left, right), axis=1).astype(np.float32)

    if articulation == "edge":
        low = one_pole_low_pass(stereo, coefficient=0.065)
        stereo = stereo + (stereo - low) * 0.22
    elif articulation == "rimshot":
        stereo *= 1.03
    return stereo


def remove_dc(samples: np.ndarray) -> np.ndarray:
    window = min(len(samples), int(SAMPLE_RATE * 0.050))
    if window == 0:
        return samples
    return samples - np.mean(samples[:window], axis=0, keepdims=True)


def align_and_trim(samples: np.ndarray) -> np.ndarray:
    samples = remove_dc(samples)
    envelope = np.max(np.abs(samples), axis=1)
    crossings = np.flatnonzero(envelope >= ONSET_THRESHOLD)
    onset = int(crossings[0]) if len(crossings) else int(np.argmax(envelope))
    start = onset - ONSET_FRAME
    if start >= 0:
        aligned = samples[start:]
    else:
        aligned = np.pad(samples, ((-start, 0), (0, 0)))

    aligned = aligned[:MAX_FRAMES]
    if len(aligned) < ONSET_FRAME + 1:
        aligned = np.pad(aligned, ((0, ONSET_FRAME + 1 - len(aligned)), (0, 0)))
    if len(aligned) >= FADE_FRAMES:
        fade = np.linspace(1.0, 0.0, FADE_FRAMES, dtype=np.float32)[:, None]
        aligned[-FADE_FRAMES:] *= fade
    return aligned.astype(np.float32)


def select_layered_hits(samples: list[SourceHit]) -> list[list[SourceHit]]:
    ordered = sorted(samples, key=lambda sample: sample.power)
    layers: list[list[SourceHit]] = []
    for layer in range(LAYER_COUNT):
        start = round(layer * len(ordered) / LAYER_COUNT)
        end = round((layer + 1) * len(ordered) / LAYER_COUNT)
        bucket = ordered[start:end] or [ordered[min(start, len(ordered) - 1)]]
        if len(bucket) >= ROUND_ROBIN_COUNT:
            indices = np.linspace(0, len(bucket) - 1, ROUND_ROBIN_COUNT).round().astype(int)
            selected = [bucket[index] for index in indices]
        else:
            selected = [bucket[index % len(bucket)] for index in range(ROUND_ROBIN_COUNT)]
        layers.append(selected)
    return layers


def parse_instrument(archive: RemoteZip, articulation: str) -> list[SourceHit]:
    xml_member = INSTRUMENT_XML[articulation]
    root = ET.fromstring(archive.read(xml_member))
    base = PurePosixPath(xml_member).parent
    hits: list[SourceHit] = []
    for sample in root.findall(".//sample"):
        audio = sample.find("audiofile")
        if audio is None:
            continue
        member = str(base / audio.attrib["file"])
        info = archive.getinfo(member)
        hits.append(
            SourceHit(
                articulation=articulation,
                name=sample.attrib.get("name", PurePosixPath(member).stem),
                member=member,
                power=float(sample.attrib.get("power", "0")),
                crc=info.CRC,
            ),
        )
    if not hits:
        raise ValueError(f"No samples found in {xml_member}")
    return hits


def download(url: str, destination: Path) -> bytes:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "NativeDrumKit/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            destination.write_bytes(response.read())
    return destination.read_bytes()


def prepare_aasimonster(archive: RemoteZip) -> list[PreparedHit]:
    prepared: list[PreparedHit] = []
    definitions = {
        "center": parse_instrument(archive, "center"),
        "off_center": parse_instrument(archive, "off_center"),
        "edge": parse_instrument(archive, "off_center"),
        "rimshot": parse_instrument(archive, "rimshot"),
    }
    for articulation, hits in definitions.items():
        for layer, selected in enumerate(select_layered_hits(hits)):
            for round_robin, hit in enumerate(selected):
                multichannel, source_rate = read_wav(archive.read(hit.member))
                if source_rate != SAMPLE_RATE:
                    multichannel = resample_linear(multichannel, source_rate)
                mixed = mix_aasimonster(multichannel, articulation)
                prepared.append(
                    PreparedHit(
                        articulation=articulation,
                        layer=layer,
                        round_robin=round_robin,
                        source=f"{hit.member}#crc={hit.crc:08x}",
                        source_power=hit.power,
                        samples=align_and_trim(mixed),
                    ),
                )
    return prepared


def prepare_cross_sticks(cache_dir: Path) -> list[PreparedHit]:
    sources: list[tuple[str, np.ndarray]] = []
    for url in CROSS_STICK_URLS:
        filename = PurePosixPath(urllib.parse.urlparse(url).path).name
        data = download(url, cache_dir / filename)
        decoded, rate = read_wav(data)
        decoded = resample_linear(decoded, rate)
        if decoded.shape[1] == 1:
            decoded = np.repeat(decoded, 2, axis=1)
        elif decoded.shape[1] > 2:
            decoded = decoded[:, :2]
        sources.append((url, align_and_trim(decoded)))

    layer_gain = (0.30, 0.42, 0.56, 0.70, 0.85, 1.0)
    prepared: list[PreparedHit] = []
    for layer in range(LAYER_COUNT):
        for round_robin, (url, samples) in enumerate(sources):
            prepared.append(
                PreparedHit(
                    articulation="cross_stick",
                    layer=layer,
                    round_robin=round_robin,
                    source=url,
                    source_power=layer_gain[layer],
                    samples=samples.copy() * layer_gain[layer],
                ),
            )
    return prepared


def attack_rms(samples: np.ndarray) -> float:
    window = samples[: min(len(samples), 4_096)]
    return float(np.sqrt(np.mean(np.square(window)))) if len(window) else 0.0


def balance_articulation_layers(hits: list[PreparedHit]) -> None:
    """Remove round-robin loudness outliers and enforce monotonic layer loudness per articulation."""
    for articulation in ARTICULATIONS:
        layers = [
            [hit for hit in hits if hit.articulation == articulation and hit.layer == layer]
            for layer in range(LAYER_COUNT)
        ]
        medians: list[float] = []
        for layer_hits in layers:
            rms_values = [max(attack_rms(hit.samples), 1e-8) for hit in layer_hits]
            target = float(np.median(rms_values))
            medians.append(target)
            for hit, rms in zip(layer_hits, rms_values):
                hit.samples *= np.clip(target / rms, 0.5, 2.0)

        monotonic_targets = np.maximum.accumulate(np.asarray(medians, dtype=np.float32))
        for layer_hits, target, median in zip(layers, monotonic_targets, medians):
            if median > 0.0:
                for hit in layer_hits:
                    hit.samples *= float(target / median)


def sample_measurements(samples: np.ndarray) -> dict[str, float | int]:
    envelope = np.max(np.abs(samples), axis=1)
    peak_index = int(np.argmax(envelope))
    peak = float(envelope[peak_index])
    onset_candidates = np.flatnonzero(envelope >= max(peak * 0.01, 1e-6))
    onset = int(onset_candidates[0]) if len(onset_candidates) else peak_index
    decay_candidates = np.flatnonzero(envelope[peak_index:] <= max(peak * 0.1, 1e-6))
    decay_frames = int(decay_candidates[0]) if len(decay_candidates) else len(envelope) - peak_index
    analysis_window = np.mean(samples[: min(len(samples), 4_096)], axis=1)
    spectrum = np.abs(np.fft.rfft(analysis_window * np.hanning(len(analysis_window))))
    frequencies = np.fft.rfftfreq(len(analysis_window), d=1.0 / SAMPLE_RATE)
    centroid = float(np.sum(frequencies * spectrum) / np.sum(spectrum)) if np.sum(spectrum) > 0 else 0.0
    return {
        "onset_frame": onset,
        "peak": peak,
        "attack_rms": attack_rms(samples),
        "decay_frames_to_minus_20db": decay_frames,
        "spectral_centroid_hz": centroid,
    }


def normalize_globally(hits: list[PreparedHit]) -> float:
    peak = max(float(np.max(np.abs(hit.samples))) for hit in hits)
    if not math.isfinite(peak) or peak <= 0.0:
        raise ValueError("Prepared bank is silent or invalid")
    gain = TARGET_PEAK / peak
    for hit in hits:
        hit.samples *= gain
    return gain


def quantize_int16(samples: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    dither = (
        rng.random(samples.shape, dtype=np.float32)
        - rng.random(samples.shape, dtype=np.float32)
    ) / 65536.0
    quantized = np.clip(samples + dither, -1.0, 0.9999695) * 32768.0
    return np.rint(quantized).astype("<i2")


def ordered_hits(hits: Iterable[PreparedHit]) -> list[PreparedHit]:
    order = {name: index for index, name in enumerate(ARTICULATIONS)}
    return sorted(
        hits,
        key=lambda hit: (order[hit.articulation], hit.layer, hit.round_robin),
    )


def write_bank(output: Path, hits: list[PreparedHit]) -> list[dict[str, object]]:
    expected = len(ARTICULATIONS) * LAYER_COUNT * ROUND_ROBIN_COUNT
    if len(hits) != expected:
        raise ValueError(f"Expected {expected} samples, got {len(hits)}")

    rng = np.random.default_rng(0x534E4152)
    descriptors: list[tuple[int, int, float, float]] = []
    pcm_chunks: list[bytes] = []
    manifest_samples: list[dict[str, object]] = []
    offset_frames = 0
    for hit in ordered_hits(hits):
        pcm = quantize_int16(hit.samples, rng)
        peak = float(np.max(np.abs(hit.samples)))
        descriptors.append((offset_frames, len(pcm), hit.source_power, peak))
        pcm_chunks.append(pcm.tobytes(order="C"))
        manifest_samples.append(
            {
                "articulation": hit.articulation,
                "layer": hit.layer,
                "round_robin": hit.round_robin,
                "source": hit.source,
                "source_power": hit.source_power,
                "frames": len(pcm),
                "peak": peak,
                "measurements": sample_measurements(hit.samples),
            },
        )
        offset_frames += len(pcm)

    header = struct.pack(
        "<8sIIIIII",
        BANK_MAGIC,
        BANK_VERSION,
        SAMPLE_RATE,
        len(ARTICULATIONS),
        LAYER_COUNT,
        ROUND_ROBIN_COUNT,
        len(descriptors),
    )
    descriptor_bytes = b"".join(
        struct.pack("<IIff", *descriptor) for descriptor in descriptors
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(header + descriptor_bytes + b"".join(pcm_chunks))
    return manifest_samples


def main() -> int:
    args = parse_args()
    manifest_path = args.manifest or args.output.with_suffix(".json")
    args.cache_dir.mkdir(parents=True, exist_ok=True)

    print("Opening licensed Aasimonster archive with HTTP range requests", flush=True)
    with RemoteZip(AASIMONSTER_URL) as archive:
        hits = prepare_aasimonster(archive)
    hits.extend(prepare_cross_sticks(args.cache_dir))
    balance_articulation_layers(hits)
    global_gain = normalize_globally(hits)
    manifest_samples = write_bank(args.output, hits)

    bank_sha256 = hashlib.sha256(args.output.read_bytes()).hexdigest()
    manifest = {
        "format": "SNAREPCM v1, stereo signed 16-bit PCM",
        "sample_rate": SAMPLE_RATE,
        "articulations": list(ARTICULATIONS),
        "velocity_layers": LAYER_COUNT,
        "round_robins": ROUND_ROBIN_COUNT,
        "onset_threshold_dbfs": -60.0,
        "onset_frame": ONSET_FRAME,
        "max_duration_seconds": MAX_FRAMES / SAMPLE_RATE,
        "normalization": "per-articulation round-robin RMS balancing, monotonic velocity-layer balancing, then one global gain to -1 dBFS peak",
        "global_gain": global_gain,
        "bank_sha256": bank_sha256,
        "sources": [
            {
                "name": "The Aasimonster 2.1",
                "url": AASIMONSTER_URL,
                "published_archive_md5": AASIMONSTER_MD5,
                "license": AASIMONSTER_LICENSE,
                "usage": "centre, off-centre, edge expression base, and rimshot",
            },
            {
                "name": "Free Wave Samples side-stick recordings",
                "urls": list(CROSS_STICK_URLS),
                "license": FREE_WAVE_LICENSE,
                "usage": "cross-stick round robins",
            },
        ],
        "samples": manifest_samples,
        "analysis": "Each sample includes aligned onset, peak, attack RMS, -20 dB decay, and spectral-centroid measurements.",
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {args.output} ({args.output.stat().st_size / 1_048_576:.1f} MiB)")
    print(f"Wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
