"""
Generate FlowState social preview PNG (1280x640) for GitHub.
Run: python images/generate_preview.py
Requires: pip install pillow
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1280, 640

img  = Image.new("RGB", (W, H), (13, 13, 13))
draw = ImageDraw.Draw(img)

# ── Background subtle grid ────────────────────────────────────────────────────
grid_color = (255, 255, 255, 8)
for y in [160, 320, 480]:
    draw.line([(0, y), (W, y)], fill=(30, 30, 30), width=1)
for x in [320, 640, 960]:
    draw.line([(x, 0), (x, H)], fill=(30, 30, 30), width=1)

# ── Fonts ─────────────────────────────────────────────────────────────────────
try:
    font_bold  = ImageFont.truetype("arialbd.ttf", 72)
    font_stat  = ImageFont.truetype("arialbd.ttf", 36)
    font_label = ImageFont.truetype("arial.ttf",   16)
except:
    font_bold  = ImageFont.load_default()
    font_stat  = font_bold
    font_label = font_bold

# ── Icon circle ───────────────────────────────────────────────────────────────
draw.ellipse([(60, 48), (164, 152)], fill=(22, 22, 22), outline=(34, 34, 34), width=1)
bolt = [(104, 64), (120, 96), (112, 96), (120, 136), (98, 104), (108, 104)]
draw.polygon(bolt, fill=(0, 230, 118))

# ── Wordmark ──────────────────────────────────────────────────────────────────
draw.text((180, 48), "Flow",  font=font_bold, fill=(255, 255, 255))
draw.text((332, 48), "State", font=font_bold, fill=(0, 230, 118))

# ── Stat boxes ────────────────────────────────────────────────────────────────
boxes = [
    (180, "−67%",   (255, 68,  68),  "QUALITY DROP"),
    (390, "Msg 18", (255, 136, 0),   "COLLAPSE POINT"),
    (600, "Free",   (0,  230, 118),  "OPEN SOURCE"),
]
for bx, val, col, label in boxes:
    by = 152
    draw.rounded_rectangle([(bx, by), (bx+185, by+68)], radius=10,
                           fill=(22,22,22), outline=(40,40,40))
    draw.text((bx + 92, by + 10), val,   font=font_stat,  fill=col,        anchor="mt")
    draw.text((bx + 92, by + 52), label, font=font_label, fill=(90,90,90), anchor="mt")

# ── Quality degradation line (starts HIGH, drops LOW = left high, right low) ──
points = [
    (120, 300), (220, 308), (340, 320), (460, 338),
    (560, 355), (660, 375), (760, 405), (860, 448),
    (960, 492), (1060, 530), (1160, 560)
]

# Area fill under the line
poly = points + [(1160, 600), (120, 600)]
draw.polygon(poly, fill=(0, 30, 15))

# Line segments green → orange → red
colors = [
    (0,230,118),(0,220,110),(20,210,90),(80,210,60),
    (160,200,0),(220,170,0),(255,136,0),(255,100,0),
    (255,68,68),(255,50,50),(255,40,40)
]
for i in range(len(points) - 1):
    draw.line([points[i], points[i+1]], fill=colors[i], width=5)

# Dots
for i, (x, y) in enumerate(points):
    draw.ellipse([(x-6, y-6), (x+6, y+6)], fill=colors[i])

# Collapse marker vertical line
draw.line([(760, 240), (760, 590)], fill=(80, 50, 0), width=1)
draw.text((760, 248), "⚠ Collapse", font=font_label, fill=(255,136,0), anchor="mt")

# Axis labels
for x, label in [(120,"Msg 1"),(460,"Msg 10"),(760,"Msg 18"),(1060,"Msg 30"),(1160,"Msg 40")]:
    draw.text((x, 580), label, font=font_label, fill=(70,70,70), anchor="mt")

out = os.path.join(os.path.dirname(__file__), "social-preview.png")
img.save(out)
print(f"Saved: {out}")
