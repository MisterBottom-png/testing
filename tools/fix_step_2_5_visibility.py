from pathlib import Path

path = Path("drum-kit-android/engine-input/src/main/java/com/vitautas/drumkit/input/LayeredInstrumentArtwork.kt")
text = path.read_text(encoding="utf-8")
old = "private class CachedArtworkLayer(\n"
new = "internal class CachedArtworkLayer(\n"
if new in text:
    print("Step 2.5 visibility already fixed")
elif text.count(old) == 1:
    path.write_text(text.replace(old, new), encoding="utf-8")
else:
    raise SystemExit("Step 2.5 visibility anchor missing")
