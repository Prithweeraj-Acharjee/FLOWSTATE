"""Generate FlowState icons — run once."""
from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(size):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # dark background circle
    pad = size // 12
    draw.ellipse([pad, pad, size-pad, size-pad], fill=(13, 13, 13, 255))

    # green lightning bolt — scaled to size
    cx, cy = size // 2, size // 2
    s = size / 48  # scale factor (base design at 48px)

    bolt = [
        (cx - 5*s,  cy - 12*s),
        (cx + 2*s,  cy - 2*s),
        (cx - 2*s,  cy - 2*s),
        (cx + 6*s,  cy + 12*s),
        (cx - 1*s,  cy + 2*s),
        (cx + 3*s,  cy + 2*s),
    ]
    draw.polygon(bolt, fill=(0, 230, 118, 255))

    return img

os.makedirs("icons", exist_ok=True)
for sz in [16, 48, 128]:
    make_icon(sz).save(f"icons/icon{sz}.png")
    print(f"icons/icon{sz}.png generated")

print("Done.")
