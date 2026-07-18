from pathlib import Path

path = Path("tools/apply_step_2_5.py")
text = path.read_text(encoding="utf-8")
old = 'replace_between(surface, "    private fun drawDrum(\\n", "    private fun drawFlash(\\n", replacement)'
new = 'replace_between(surface, "    private fun drawDrum(\\n", "    private fun drawFlash(canvas:", replacement)'
if text.count(old) != 1:
    raise SystemExit("Step 2.5 marker correction anchor missing")
path.write_text(text.replace(old, new), encoding="utf-8")
