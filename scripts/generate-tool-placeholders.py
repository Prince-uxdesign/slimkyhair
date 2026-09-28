#!/usr/bin/env python3
"""
Placeholder product illustrations for Hair Tools & Accessories — Slimky Hair.

Draws a simple, on-brand illustration for each physical tool (bonnet, combs,
brushes, hot comb, towel wrap, scrunchies, pillowcase) until real product
photography is ready, and writes the same file set the catalogue expects for
every product image:

    assets/placeholders/tools/<name>.jpg / .webp          (896x1200 original)
    assets/placeholders/tools/<name>-480.jpg / .webp
    assets/placeholders/tools/<name>-768.jpg / .webp

To swap in real photos later, replace these files with 896x1200 portrait
JPEGs of the same name and re-run scripts/optimize-images.py-style resizing
(or this script's `derivatives()` step) — no code changes needed.

Usage:  python3 scripts/generate-tool-placeholders.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "placeholders", "tools")

W, H = 896, 1200
S = 2  # supersample factor for smooth edges

# Brand palette (css/tokens.css)
CREAM = (244, 239, 234)
SAND = (232, 226, 217)
ESPRESSO = (44, 30, 24)
SAGE = (59, 78, 67)
SAGE_LIGHT = (90, 113, 99)
SAGE_DARK = (42, 56, 48)
TAUPE = (140, 134, 129)
TORTOISE = (139, 94, 60)
CHAMPAGNE = (222, 202, 178)
ROSE = (196, 150, 138)
STEEL = (170, 172, 175)

FONT_PATH = "/System/Library/Fonts/Supplemental/Georgia.ttf"


def canvas():
    img = Image.new("RGB", (W * S, H * S), CREAM)
    return img, ImageDraw.Draw(img)


def p(*vals):
    """Scale design coordinates (896x1200 space) to the supersampled canvas."""
    return [v * S for v in vals]


def shadow(img, cx, cy, rx, ry, strength=60):
    layer = Image.new("L", img.size, 0)
    ImageDraw.Draw(layer).ellipse(p(cx - rx, cy - ry, cx + rx, cy + ry), fill=strength)
    layer = layer.filter(ImageFilter.GaussianBlur(28 * S))
    dark = Image.new("RGB", img.size, (120, 104, 92))
    img.paste(dark, (0, 0), layer)


def wordmark(draw):
    try:
        font = ImageFont.truetype(FONT_PATH, 26 * S)
    except OSError:
        font = ImageFont.load_default()
    text = "SLIMKY HAIR"
    spaced = " ".join(text)
    box = draw.textbbox((0, 0), spaced, font=font)
    tw = box[2] - box[0]
    draw.text(((W * S - tw) / 2, 1100 * S), spaced, fill=TAUPE, font=font)


def rrect(draw, box, r, fill):
    draw.rounded_rectangle(p(*box), radius=r * S, fill=fill)


# --------------------------------------------------------------------------
# Illustrations
# --------------------------------------------------------------------------

def satin_bonnet():
    img, d = canvas()
    shadow(img, 448, 860, 300, 40)
    d = ImageDraw.Draw(img)
    # Dome
    d.pieslice(p(128, 300, 768, 940), 180, 360, fill=SAGE)
    d.rectangle(p(128, 618, 768, 700), fill=SAGE)
    # Satin sheen
    for i, (off, w) in enumerate([(0, 26), (70, 14)]):
        d.arc(p(210 + off, 380 + off, 686 - off, 860 - off), 200, 280, fill=SAGE_LIGHT, width=w * S)
    # Band
    rrect(d, (110, 690, 786, 790), 50, SAGE_DARK)
    for x in range(150, 760, 34):
        d.line(p(x, 704, x + 10, 776), fill=SAGE, width=3 * S)
    # Toggle
    rrect(d, (420, 760, 476, 840), 14, CHAMPAGNE)
    return img


def wide_tooth_comb():
    img, d = canvas()
    shadow(img, 448, 900, 320, 36)
    d = ImageDraw.Draw(img)
    # Spine
    rrect(d, (120, 330, 776, 450), 40, TORTOISE)
    # Teeth
    x = 150
    while x < 740:
        rrect(d, (x, 420, x + 38, 850), 19, TORTOISE)
        x += 66
    # Tortoiseshell flecks
    for (cx, cy, r) in [(220, 380, 18), (330, 360, 12), (480, 395, 22), (610, 370, 14), (700, 400, 10)]:
        d.ellipse(p(cx - r, cy - r, cx + r, cy + r), fill=(110, 70, 42))
    # Highlight
    rrect(d, (150, 346, 740, 362), 8, (170, 124, 88))
    return img


def detangling_brush():
    img, d = canvas()
    shadow(img, 448, 1010, 180, 30)
    d = ImageDraw.Draw(img)
    # Handle
    rrect(d, (398, 640, 498, 1000), 50, SAGE_DARK)
    # Head
    d.ellipse(p(218, 180, 678, 720), fill=SAGE)
    # Flexible vents
    for i in range(-2, 3):
        cx = 448 + i * 78
        rrect(d, (cx - 14, 250, cx + 14, 650), 14, SAGE_DARK)
    # Ball-tipped bristles
    for row in range(9):
        y = 262 + row * 46
        for col in range(-3, 4):
            x = 448 + col * 78 + (39 if row % 2 else 0)
            if ((x - 448) / 210) ** 2 + ((y - 450) / 250) ** 2 < 1:
                d.ellipse(p(x - 9, y - 9, x + 9, y + 9), fill=CHAMPAGNE)
    return img


def hot_comb():
    img, d = canvas()
    shadow(img, 448, 1000, 240, 30)
    d = ImageDraw.Draw(img)
    # Cord
    pts = [(448, 1040), (560, 1070), (700, 1030), (760, 950)]
    d.line([tuple(v * S for v in pt) for pt in pts], fill=ESPRESSO, width=12 * S, joint="curve")
    # Handle
    rrect(d, (390, 560, 506, 1040), 40, ESPRESSO)
    rrect(d, (410, 640, 486, 700), 10, (80, 62, 52))  # heat dial
    d.ellipse(p(432, 648, 464, 692), fill=CHAMPAGNE)
    # Neck
    rrect(d, (410, 500, 486, 580), 12, (90, 90, 94))
    # Ceramic comb head
    rrect(d, (250, 200, 646, 300), 24, STEEL)
    x = 262
    while x < 640:
        rrect(d, (x, 280, x + 16, 520), 8, STEEL)
        x += 30
    rrect(d, (250, 470, 646, 520), 20, STEEL)
    # Ceramic sheen
    rrect(d, (262, 214, 634, 230), 8, (206, 208, 210))
    return img


def rat_tail_comb():
    img, d = canvas()
    shadow(img, 448, 960, 240, 30)
    d = ImageDraw.Draw(img)
    img2 = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d2 = ImageDraw.Draw(img2)
    # Comb body (drawn upright, then rotated)
    rrect(d2, (408, 140, 488, 560), 20, ESPRESSO)
    y = 150
    while y < 550:
        rrect(d2, (470, y, 560, y + 10), 5, ESPRESSO)
        y += 22
    # Tail
    d2.polygon([tuple(v * S for v in pt) for pt in [(420, 550), (476, 550), (452, 1010), (444, 1010)]], fill=ESPRESSO)
    # Second comb, offset behind
    img3 = img2.rotate(-18, center=(448 * S, 580 * S), resample=Image.BICUBIC)
    tint = Image.new("RGBA", img.size, (0, 0, 0, 0))
    tint.paste((110, 96, 88, 255), (0, 0), img3.split()[3])
    back = tint.transform(img.size, Image.AFFINE, (1, 0, -70 * S, 0, 1, 20 * S))
    img.paste(back, (0, 0), back)
    front = img2.rotate(-12, center=(448 * S, 580 * S), resample=Image.BICUBIC)
    img.paste(front, (0, 0), front)
    return img


def edge_brush():
    img, d = canvas()
    shadow(img, 448, 960, 240, 30)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d2 = ImageDraw.Draw(layer)
    # Handle
    rrect(d2, (410, 360, 486, 900), 30, ROSE)
    # Bristle block
    rrect(d2, (390, 250, 506, 380), 16, (170, 124, 114))
    for x in range(398, 500, 12):
        d2.line(p(x, 250, x, 170), fill=ESPRESSO, width=5 * S)
    # Comb end
    rrect(d2, (400, 880, 496, 920), 10, ROSE)
    for x in range(404, 494, 11):
        rrect(d2, (x, 910, x + 6, 1010), 3, ROSE)
    rotated = layer.rotate(-20, center=(448 * S, 600 * S), resample=Image.BICUBIC)
    img.paste(rotated, (0, 0), rotated)
    return img


def towel_wrap():
    img, d = canvas()
    shadow(img, 448, 880, 330, 40)
    d = ImageDraw.Draw(img)
    fold = (206, 184, 158)
    # Three folded layers, stacked
    for i, top in enumerate((600, 470, 340)):
        rrect(d, (130 + i * 10, top, 766 - i * 10, top + 200), 60, CHAMPAGNE)
        d.line(p(170 + i * 10, top + 196, 726 - i * 10, top + 196), fill=fold, width=4 * S)
        # Microfibre texture stripes
        for x in range(190 + i * 10, 720 - i * 10, 36):
            d.line(p(x, top + 30, x, top + 120), fill=(230, 214, 194), width=3 * S)
    # Hem stripe
    rrect(d, (150, 356, 746, 376), 8, SAGE_LIGHT)
    # Elastic loop + button
    d.arc(p(620, 250, 720, 370), 180, 360, fill=SAGE_DARK, width=8 * S)
    d.ellipse(p(250, 390, 298, 438), fill=SAGE)
    d.ellipse(p(266, 406, 282, 422), fill=SAGE_DARK)
    return img


def satin_scrunchies():
    img, d = canvas()
    shadow(img, 448, 900, 330, 40)
    d = ImageDraw.Draw(img)
    colors = [SAGE, ROSE, CHAMPAGNE, ESPRESSO, TORTOISE, SAGE_LIGHT]
    spots = [(300, 440), (596, 440), (448, 560), (270, 720), (626, 720), (448, 790)]
    for (cx, cy), col in zip(spots, colors):
        R, r = 130, 55
        # Ruffled ring
        for k in range(18):
            a = 2 * math.pi * k / 18
            bx, by = cx + math.cos(a) * (R - 20), cy + math.sin(a) * (R - 20) * 0.8
            d.ellipse(p(bx - 42, by - 36, bx + 42, by + 36), fill=col)
        lighter = tuple(min(255, c + 28) for c in col)
        d.ellipse(p(cx - R + 20, cy - (R - 20) * 0.8, cx + R - 20, cy + (R - 20) * 0.8), fill=col)
        d.arc(p(cx - R + 34, cy - (R - 34) * 0.8, cx + R - 34, cy + (R - 34) * 0.8), 200, 300, fill=lighter, width=10 * S)
        d.ellipse(p(cx - r, cy - r * 0.8, cx + r, cy + r * 0.8), fill=CREAM)
    return img


def satin_pillowcase():
    img, d = canvas()
    shadow(img, 448, 890, 360, 44)
    d = ImageDraw.Draw(img)
    rrect(d, (100, 400, 796, 860), 90, CHAMPAGNE)
    # Satin sheen
    d.polygon([tuple(v * S for v in pt) for pt in [(220, 420), (360, 420), (200, 840), (120, 840)]], fill=(236, 222, 204))
    d.polygon([tuple(v * S for v in pt) for pt in [(420, 420), (470, 420), (310, 840), (260, 840)]], fill=(236, 222, 204))
    # Seam
    d.rounded_rectangle(p(126, 426, 770, 834), radius=70 * S, outline=(205, 184, 160), width=3 * S)
    # Sage piping
    d.rounded_rectangle(p(100, 400, 796, 860), radius=90 * S, outline=SAGE, width=8 * S)
    return img


ILLUSTRATIONS = {
    "satin-bonnet": satin_bonnet,
    "wide-tooth-comb": wide_tooth_comb,
    "detangling-brush": detangling_brush,
    "hot-comb": hot_comb,
    "parting-comb": rat_tail_comb,
    "edge-brush": edge_brush,
    "towel-wrap": towel_wrap,
    "satin-scrunchies": satin_scrunchies,
    "satin-pillowcase": satin_pillowcase,
}


def derivatives(name, img):
    """Write original + 480/768 derivatives in JPEG and WebP."""
    img.save(os.path.join(OUT, f"{name}.jpg"), "JPEG", quality=86, progressive=True, optimize=True)
    img.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=80, method=6)
    for width in (480, 768):
        h = round(H * width / W)
        small = img.resize((width, h), Image.LANCZOS)
        small.save(os.path.join(OUT, f"{name}-{width}.jpg"), "JPEG", quality=82, progressive=True, optimize=True)
        small.save(os.path.join(OUT, f"{name}-{width}.webp"), "WEBP", quality=80, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, draw_fn in ILLUSTRATIONS.items():
        big = draw_fn()
        d = ImageDraw.Draw(big)
        wordmark(d)
        img = big.resize((W, H), Image.LANCZOS)
        derivatives(name, img)
        print("wrote", name)


if __name__ == "__main__":
    main()
