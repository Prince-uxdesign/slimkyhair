# Slimky Hair — social sharing image (OG default)

`og-default.jpg` (1200×630) is the **interim branded share image**.

- Solid brand colours + wordmark only. No product packaging, no stock photography, no customer/admin imagery.
- Referenced by every page's `og:image` / `twitter:image` as the global fallback; page-specific pages (products, categories, about) override it with their own approved image.

## Replacing with the final asset

1. Export the final branded image at **1200×630** (JPG or PNG, < 1 MB, key content centred for mobile crops).
2. Overwrite this file **keeping the same filename** (`og-default.jpg`).
3. If you switch to PNG, update the `og:image:type` tags site-wide (`image/jpeg` → `image/png`).
4. Re-test a share URL in the Facebook Sharing Debugger / X Card Validator.

No layout or HTML changes are needed for the swap.
