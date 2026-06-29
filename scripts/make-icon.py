#!/usr/bin/env python3
"""Render the Inkubus dock/app icon: the sigil mark, filled with the brand
ember->flame gradient, centered on a dark charcoal macOS "squircle" with a soft
ember glow. Outputs a 1024x1024 PNG that scripts/make-icon.sh turns into .icns.

Run with a Python that has Pillow, e.g.:  /opt/anaconda3/bin/python3 scripts/make-icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGIL = os.path.join(ROOT, "frontend", "public", "inkubus-mark.png")
OUT = os.path.join(ROOT, "electron", "assets", "icon-1024.png")

SIZE = 1024
MARGIN = 64                      # transparent margin around the squircle
RADIUS = 200                     # corner radius of the squircle
CHARCOAL = (23, 18, 15, 255)     # --bg #17120f
# brand gradient (site: linear-gradient(0deg, #e0560f, #ff7a18 45%, #fff2cf))
BOTTOM = (224, 86, 15)           # ember-500 #e0560f
MID = (255, 122, 24)             # ember-400 #ff7a18  (~55% from top)
TOP = (255, 242, 207)            # flame-300 #fff2cf


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(w, h):
    """Top->bottom: TOP -> MID (at 0.55) -> BOTTOM."""
    grad = Image.new("RGB", (1, h))
    px = grad.load()
    for y in range(h):
        t = y / max(1, h - 1)
        if t <= 0.55:
            px[0, y] = lerp(TOP, MID, t / 0.55)
        else:
            px[0, y] = lerp(MID, BOTTOM, (t - 0.55) / 0.45)
    return grad.resize((w, h))


def main():
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # charcoal squircle background
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle([MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN],
                        radius=RADIUS, fill=CHARCOAL)
    canvas = Image.alpha_composite(canvas, bg)

    # soft ember glow behind the mark
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, r = SIZE // 2, SIZE // 2, 300
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 122, 24, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    # clip glow to the squircle so it doesn't bleed into the transparent corners
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN], radius=RADIUS, fill=255)
    canvas.paste(glow, (0, 0), Image.composite(glow.split()[-1], Image.new("L", (SIZE, SIZE), 0), mask))

    # the gradient-filled sigil
    sigil = Image.open(SIGIL).convert("RGBA")
    alpha = sigil.split()[-1]
    target_w = 660
    target_h = round(target_w * sigil.height / sigil.width)
    alpha = alpha.resize((target_w, target_h), Image.LANCZOS)
    grad = vertical_gradient(target_w, target_h).convert("RGBA")
    grad.putalpha(alpha)

    pos = ((SIZE - target_w) // 2, (SIZE - target_h) // 2)
    canvas.alpha_composite(grad, pos)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.save(OUT)
    print("wrote", OUT, canvas.size)


if __name__ == "__main__":
    main()
