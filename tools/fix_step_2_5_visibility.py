from pathlib import Path

path = Path("drum-kit-android/engine-input/src/main/java/com/vitautas/drumkit/input/LayeredInstrumentArtwork.kt")
text = path.read_text(encoding="utf-8")
old = "private class CachedArtworkLayer(\n"
new = "internal class CachedArtworkLayer(\n"
if text.count(old) != 1:
    raise SystemExit("Step 2.5 visibility anchor missing")
path.write_text(text.replace(old, new), encoding="utf-8")
