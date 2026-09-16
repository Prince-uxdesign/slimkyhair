# Slimky Hair — Image & Media Replacement System

All images across the Slimky Hair web application follow a strict fixed-aspect-ratio container standard (`.media-frame` in `css/components/images.css`). This guarantees that replacing placeholder assets with official brand imagery will never break layouts, shift grids, or require CSS adjustments.

---

## Directory Organization

```
assets/
├── placeholders/
│   ├── products/
│   │   ├── oil-dropper-bottle.jpg     # 4:5 portrait (Generic unbranded amber dropper)
│   │   ├── cream-jar.jpg              # 4:5 portrait (Generic unbranded amber cream jar)
│   │   └── shampoo-pump-bottle.jpg    # 4:5 portrait (Generic unbranded pump bottle)
│   └── lifestyle/
│       ├── textured-hair-portrait.jpg # 3:4 portrait (Natural 4C textured hair editorial)
│       └── scalp-oil-routine.jpg      # 3:4 portrait (Authentic scalp application routine)
└── brand/                             # [DROP OFFICIAL ASSETS HERE ONCE READY]
    ├── products/
    └── lifestyle/
```

---

## Aspect Ratio Standards

| Context | Class | Aspect Ratio | Dimensions (Recommended) |
| :--- | :--- | :--- | :--- |
| **Product Cards & Catalog** | `.media-frame-product` | `4:5` | `800 × 1000 px` |
| **Editorial & Storytelling** | `.media-frame-editorial` | `3:4` | `900 × 1200 px` |
| **Square Details & Swatches** | `.media-frame-square` | `1:1` | `800 × 800 px` |
| **Routine & How-To Steps** | `.media-frame-ritual` | `4:3` | `1200 × 900 px` |
| **Hero & Wide Banners** | `.media-frame-landscape` | `16:9` | `1920 × 1080 px` |

---

## Rules for New Assets

1. **Aspect Ratios**: Ensure replacement imagery matches the container aspect ratio (`4:5` for products, `3:4` for editorial lifestyle).
2. **Object Fit**: The system automatically applies `object-fit: cover` with focal-point classes (`.media-img-center`, `.media-img-top`).
3. **Lazy Loading**: All below-the-fold imagery should retain `loading="lazy"`.
4. **Alt Text**: Replace descriptive alt text to reflect official product formulation names.
