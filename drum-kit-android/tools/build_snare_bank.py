#!/usr/bin/env python3
"""Run the snare bank builder with WAVE_FORMAT_EXTENSIBLE support."""

from __future__ import annotations

import io
import sys

import soundfile as sf

import prepare_snare_bank as builder


def read_wav(data: bytes):
    samples, sample_rate = sf.read(
        io.BytesIO(data),
        dtype="float32",
        always_2d=True,
    )
    return samples, sample_rate


def main() -> int:
    builder.read_wav = read_wav
    return builder.main()


if __name__ == "__main__":
    sys.exit(main())
