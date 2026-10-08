# Generates the A-Studio placeholder icon SVGs (1024 grid). Original work, MIT OR Apache-2.0.
# usage: python3 scripts/icon-svgs.py assets/app-icon   (then export PNGs with scripts/render-svg.js)
import sys, os
BG, PIX, VEC, INK, PAGE, FOLD = "#1D2130", "#FF7A45", "#3CC8B4", "#F4F1EA", "#F4F1EA", "#C9C4B8"

def mark(cx, cy, r, bg):
    """Half-pixel, half-vector disc: left half in square cells, right half a smooth arc with a handle."""
    cell = r / 4
    cols = []  # (x0, x1, top, bottom) of each column of cells whose centre lies inside the disc
    for i in range(4):
        x0 = cx - r + i * cell
        ys = [cy - r + j * cell for j in range(8)
              if (x0 + cell / 2 - cx) ** 2 + (cy - r + j * cell + cell / 2 - cy) ** 2 <= r * r]
        cols.append((x0, x0 + cell, min(ys), max(ys) + cell))
    # One outline (no seams between cells): along the tops left to right, back along the bottoms.
    pts = []
    for x0, x1, top, _ in cols:
        pts += [(x0, top), (x1, top)]
    for x0, x1, _, bot in reversed(cols):
        pts += [(x1, bot), (x0, bot)]
    stairs = "M" + " L".join(f"{x:g} {y:g}" for x, y in pts) + " Z"
    k = r / 296  # handle sizes scale with the disc
    h, sw, dot, box = 170 * k, 20 * k, 30 * k, 40 * k
    return f'''<path d="{stairs}" fill="{PIX}"/>
  <path d="M{cx:g} {cy - r:g} A{r:g} {r:g} 0 0 1 {cx:g} {cy + r:g} Z" fill="{VEC}"/>
  <line x1="{cx + r:g}" y1="{cy - h:g}" x2="{cx + r:g}" y2="{cy + h:g}" stroke="{INK}" stroke-width="{sw:g}" stroke-linecap="round"/>
  <circle cx="{cx + r:g}" cy="{cy - h:g}" r="{dot:g}" fill="{INK}"/>
  <circle cx="{cx + r:g}" cy="{cy + h:g}" r="{dot:g}" fill="{INK}"/>
  <rect x="{cx + r - box:g}" y="{cy - box:g}" width="{2 * box:g}" height="{2 * box:g}" fill="{bg}" stroke="{INK}" stroke-width="{sw:g}"/>'''

def svg(title, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>{title}</title>
  {body}
</svg>
'''

app = svg("A-Studio app icon (placeholder)",
          f'<rect x="32" y="32" width="960" height="960" rx="216" fill="{BG}"/>\n  ' + mark(512, 512, 296, BG))
# Maskable web icon: full-bleed background, mark inside the central 60 % safe zone.
maskable = svg("A-Studio maskable web icon (placeholder)",
               f'<rect width="1024" height="1024" fill="{BG}"/>\n  ' + mark(500, 512, 230, BG))
# .astudio document icon: a page with a folded corner and the mark on a dark tile.
doc = svg("A-Studio document icon (placeholder)", f'''<path d="M200 48 H648 L824 224 V976 H200 Z" fill="{PAGE}"/>
  <path d="M648 48 V224 H824 Z" fill="{FOLD}"/>
  <rect x="272" y="400" width="480" height="480" rx="96" fill="{BG}"/>
  ''' + mark(500, 640, 156, BG))

out = sys.argv[1]
os.makedirs(os.path.join(out, "document"), exist_ok=True)
os.makedirs(os.path.join(out, "web"), exist_ok=True)
for name, text in (("a-studio.svg", app), ("web/a-studio-maskable.svg", maskable), ("document/astudio-document.svg", doc)):
    with open(os.path.join(out, name), "w") as f:
        f.write(text)
