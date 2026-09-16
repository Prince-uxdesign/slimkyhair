#!/usr/bin/env python3
"""
Responsive image derivative generator — Slimky Hair (static site, no build step).

Reads the APPROVED photographic JPEGs under assets/ and writes smaller
responsive derivatives next to the originals:

    <stem>-480.webp / <stem>-480.jpg      (phones: 360-480px viewports)
    <stem>-768.webp / <stem>-768.jpg      (tablets / DPR 2x cards)

Originals are NEVER modified, recompressed, or replaced — they remain the
`src` fallback and the largest `srcset` candidate, so premium photography
quality is fully preserved. Markup references derivatives via <picture>
(WebP first, JPEG fallback), so browsers without WebP still get the
right-sized JPEG.

Quality guardrails: high-quality settings (WebP q80, JPEG q82 progressive)
plus a per-file fidelity check (mean absolute pixel difference of each
derivative vs. the original downscaled to the same size). The script FAILS
if any derivative drifts beyond tolerance.

AVIF: deliberately not shipped. At these sizes WebP captures most of the
gain; AVIF decode is measurably heavier on low-end mobile GPUs/CPUs and
adds a third file set. Revisit if hero LCP regresses.

Usage:  python3 scripts/optimize-images.py
"""
import os
import sys
from PIL import Image, ImageChops, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Only photographs actually referenced by HTML/JS/CSS (see audit). Dead
# files (assets/images/* dupes, scalp-oil-routine.jpg) are out of scope.
SOURCES = [
    "assets/placeholders/lifestyle/hero-lifestyle.jpg",
    "assets/placeholders/lifestyle/philosophy-lifestyle.jpg",
    "assets/placeholders/lifestyle/formulation-craft.jpg",
    "assets/placeholders/lifestyle/textured-hair-portrait.jpg",
    "assets/placeholders/lifestyle/campaign-lifestyle.jpg",
    "assets/placeholders/lifestyle/category-curly.jpg",
    "assets/placeholders/lifestyle/category-coily.jpg",
    "assets/placeholders/lifestyle/category-wavy.jpg",
    "assets/placeholders/lifestyle/category-straight.jpg",
    "assets/placeholders/products/oil-dropper-bottle.jpg",
    "assets/placeholders/products/cream-jar.jpg",
    "assets/placeholders/products/shampoo-pump-bottle.jpg",
    "assets/placeholders/products/conditioner-bottle.jpg",
]

TARGET_WIDTHS = (480, 768)
WEBP_QUALITY = 80
FULL_WEBP_QUALITY = 82
JPEG_QUALITY = 82
# Max mean per-channel abs diff (0-255) vs. original at same size.
FIDELITY_TOLERANCE = 6.0


def fidelity(original: Image.Image, path: str) -> float:
    cand = Image.open(path).convert("RGB")
    ref = original.resize(cand.size, Image.LANCZOS)
    diff = ImageChops.difference(ref, cand)
    stat = ImageStat.Stat(diff)
    return sum(stat.mean) / len(stat.mean)


def main() -> int:
    total_orig = 0
    total_deriv = 0
    failures = []
    print(f"{'source':58} {'orig KB':>8} {'+webp KB':>16} {'+jpeg KB':>16} {'fidelity':>9}")
    for rel in SOURCES:
        src_path = os.path.join(ROOT, rel)
        if not os.path.isfile(src_path):
            failures.append(f"missing source: {rel}")
            continue
        stem, _ = os.path.splitext(src_path)
        im = Image.open(src_path).convert("RGB")
        total_orig += os.path.getsize(src_path)
        # Full-width WebP: same pixels as the approved original, modern
        # container. Lets <picture> serve WebP at every slot (incl. DPR 2x
        # gallery) while the untouched JPEG stays the final fallback.
        full_wp = f"{stem}.webp"
        im.save(full_wp, "WEBP", quality=FULL_WEBP_QUALITY, method=6)
        total_deriv += os.path.getsize(full_wp)
        fids_full = [fidelity(im, full_wp)]
        webp_sizes, jpeg_sizes, fids = [os.path.getsize(full_wp) // 1024], [], fids_full
        for w in TARGET_WIDTHS:
            if im.width <= w:
                continue  # never upscale
            h = round(im.height * w / im.width)
            small = im.resize((w, h), Image.LANCZOS)
            wp, jp = f"{stem}-{w}.webp", f"{stem}-{w}.jpg"
            small.save(wp, "WEBP", quality=WEBP_QUALITY, method=6)
            small.save(jp, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            webp_sizes.append(os.path.getsize(wp) // 1024)
            jpeg_sizes.append(os.path.getsize(jp) // 1024)
            total_deriv += os.path.getsize(wp) + os.path.getsize(jp)
            fids.append(fidelity(im, wp))
            fids.append(fidelity(im, jp))
        worst = max(fids) if fids else 0.0
        status = "OK " if worst <= FIDELITY_TOLERANCE else "FAIL"
        if worst > FIDELITY_TOLERANCE:
            failures.append(f"fidelity {worst:.2f} > {FIDELITY_TOLERANCE}: {rel}")
        print(
            f"{rel:58} {os.path.getsize(src_path)//1024:>8} "
            f"{str(webp_sizes):>16} {str(jpeg_sizes):>16} {status} {worst:.2f}"
        )
    print(f"\noriginals total: {total_orig/1024:.0f} KB | derivatives total: {total_deriv/1024:.0f} KB")
    if failures:
        print("FAILURES:")
        for f in failures:
            print("  -", f)
        return 1
    print("OK: all derivatives written within fidelity tolerance; originals untouched.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
