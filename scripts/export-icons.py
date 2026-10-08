# Exports every A-Studio icon size from the 1024 px masters (Windows only, D7). Original work,
# MIT OR Apache-2.0. Needs Pillow.
# usage: python3 scripts/icon-svgs.py assets/app-icon
#        node scripts/render-svg.js <each .svg> <same name>-1024.png
#        python3 scripts/export-icons.py assets/app-icon
import os, sys
from PIL import Image

d = sys.argv[1]
L = Image.LANCZOS
ICO = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
app = Image.open(os.path.join(d, "a-studio-1024.png")).convert("RGBA")
doc = Image.open(os.path.join(d, "document/astudio-document-1024.png")).convert("RGBA")
mask = Image.open(os.path.join(d, "web/a-studio-maskable-1024.png")).convert("RGBA")
app.save(os.path.join(d, "a-studio.ico"), sizes=ICO)
doc.save(os.path.join(d, "document/astudio-document.ico"), sizes=ICO)
app.resize((32, 32), L).save(os.path.join(d, "web/favicon-32.png"))
app.resize((192, 192), L).save(os.path.join(d, "web/icon-192.png"))
app.resize((512, 512), L).save(os.path.join(d, "web/icon-512.png"))
mask.resize((512, 512), L).save(os.path.join(d, "web/icon-maskable-512.png"))
# Apple touch icons are shown without transparency: use the full-bleed version.
mask.convert("RGB").resize((180, 180), L).save(os.path.join(d, "web/apple-touch-icon-180.png"))
