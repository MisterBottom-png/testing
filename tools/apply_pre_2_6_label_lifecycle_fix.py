from pathlib import Path

path = Path("drum-kit-android/engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt")
text = path.read_text(encoding="utf-8")
marker = "    override fun onAttachedToWindow() {\n"
if marker in text:
    print("Label lifecycle correction already applied")
    raise SystemExit(0)
old = """    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        super.onDetachedFromWindow()\n    }\n"""
new = """    override fun onAttachedToWindow() {\n        super.onAttachedToWindow()\n        if (width <= 0 || height <= 0) return\n\n        labelsVisibleSinceNanos = System.nanoTime()\n        removeCallbacks(labelFadeRunnable)\n        postDelayed(labelFadeRunnable, LabelHoldMillis + 16L)\n        postInvalidateOnAnimation()\n    }\n\n    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        super.onDetachedFromWindow()\n    }\n"""
if text.count(old) != 1:
    raise SystemExit("DrumSurfaceView label lifecycle anchor missing")
path.write_text(text.replace(old, new), encoding="utf-8")

mapping = Path("drum-kit-android/docs/source-mapping.md")
text = mapping.read_text(encoding="utf-8")
old = """Cached bitmaps are released and rebuilt on resize and retained across temporary View detach/reattach cycles.\n"""
new = """Cached bitmaps are released and rebuilt on resize and retained across temporary View detach/reattach cycles. Reattachment also restarts the timed label-fade schedule so a removed callback cannot leave labels permanently visible.\n"""
if text.count(old) != 1:
    raise SystemExit("source mapping lifecycle anchor missing")
mapping.write_text(text.replace(old, new), encoding="utf-8")

print("Applied label lifecycle correction")
