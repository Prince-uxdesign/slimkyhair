/**
 * Isolated Demo Cart Dataset - Slimky Hair E-Commerce
 * 
 * Provides generic, unbranded hair-care products with multi-variants and 
 * stock limits for isolated cart data architecture and testing (C1/C2).
 * 
 * Complies strictly with project guidelines:
 * - Uses fictional generic names (Demo Nourishing Hair Oil, Demo Moisture Shampoo, etc.)
 * - Zero fake packaging, fake certifications, or medical claims
 * - Fully isolated from the production catalog (js/catalog-data.js)
 */

export const DEMO_PRODUCTS = [
  {
    id: "demo-oil",
    slug: "demo-nourishing-hair-oil",
    name: "Demo Nourishing Hair Oil",
    category: "Hair Oils",
    categorySlug: "hair-oils",
    productType: "Hair Oil",
    descriptor: "Generic botanical oil formulation for cart testing",
    image: "assets/placeholders/products/oil-dropper-bottle.jpg",
    images: {
      packaging: "assets/placeholders/products/oil-dropper-bottle.jpg"
    },
    variants: [
      {
        id: "demo-oil-50",
        size: "50ml",
        name: "50ml",
        priceFormatted: "₦15,000",
        priceValue: 15000,
        sku: "DEMO-OIL-050",
        stock: 10,
        availability: "In Stock"
      },
      {
        id: "demo-oil-100",
        size: "100ml",
        name: "100ml",
        priceFormatted: "₦26,000",
        priceValue: 26000,
        sku: "DEMO-OIL-100",
        stock: 5,
        availability: "In Stock"
      },
      {
        id: "demo-oil-200",
        size: "200ml",
        name: "200ml",
        priceFormatted: "₦48,000",
        priceValue: 48000,
        sku: "DEMO-OIL-200",
        stock: 0,
        availability: "Out of Stock"
      }
    ]
  },
  {
    id: "demo-shampoo",
    slug: "demo-moisture-shampoo",
    name: "Demo Moisture Shampoo",
    category: "Shampoo & Cleansers",
    categorySlug: "shampoo",
    productType: "Shampoo",
    descriptor: "Generic gentle hydrating cleanser for cart testing",
    image: "assets/placeholders/products/shampoo-pump-bottle.jpg",
    images: {
      packaging: "assets/placeholders/products/shampoo-pump-bottle.jpg"
    },
    variants: [
      {
        id: "demo-shp-250",
        size: "250ml",
        name: "250ml",
        priceFormatted: "₦12,000",
        priceValue: 12000,
        sku: "DEMO-SHP-250",
        stock: 15,
        availability: "In Stock"
      },
      {
        id: "demo-shp-500",
        size: "500ml",
        name: "500ml",
        priceFormatted: "₦20,000",
        priceValue: 20000,
        sku: "DEMO-SHP-500",
        stock: 8,
        availability: "In Stock"
      }
    ]
  },
  {
    id: "demo-conditioner",
    slug: "demo-curl-conditioner",
    name: "Demo Curl Conditioner",
    category: "Conditioners",
    categorySlug: "conditioners",
    productType: "Conditioner",
    descriptor: "Generic high-slip conditioning rinse for cart testing",
    image: "assets/placeholders/products/cream-jar.jpg",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      {
        id: "demo-cnd-250",
        size: "250ml",
        name: "250ml",
        priceFormatted: "₦14,000",
        priceValue: 14000,
        sku: "DEMO-CND-250",
        stock: 12,
        availability: "In Stock"
      },
      {
        id: "demo-cnd-500",
        size: "500ml",
        name: "500ml",
        priceFormatted: "₦24,000",
        priceValue: 24000,
        sku: "DEMO-CND-500",
        stock: 4,
        availability: "Low Stock"
      }
    ]
  }
];
