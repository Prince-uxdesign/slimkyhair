/**
 * Centralized Catalog Data Store - Slimky Hair
 * 
 * Provides unified data for Shop, Dynamic Category Pages, Search, and Product Detail Pages.
 * All prices are formatted in Nigerian Naira (₦) with numeric values for sorting and filtering.
 * Structured to be 100% compatible with future Supabase / PostgreSQL backend.
 */

export const CATEGORIES = [
  {
    slug: "hair-oils",
    name: "Hair Oils",
    headline: "Botanical Hair & Scalp Oils",
    description: "Cold-pressed plant elixirs engineered to seal cuticle moisture, fortify delicate strands, and impart weightless luster.",
    productCount: 3,
    metaTitle: "Botanical Hair Oils & Elixirs | Slimky Hair",
    metaDescription: "Explore nutrient-dense, cold-pressed botanical hair oils crafted to nourish the scalp and lock in lasting moisture."
  },
  {
    slug: "shampoo",
    name: "Shampoo & Cleansers",
    headline: "Gentle Botanical Cleansers",
    description: "Sulfate-free, pH-balanced formulas that clarify scalp impurities and product buildup without stripping essential lipid moisture.",
    productCount: 2,
    metaTitle: "Gentle Botanical Shampoos | Slimky Hair",
    metaDescription: "Discover non-stripping, sulfate-free cleansers that purify your scalp while preserving natural curl hydration."
  },
  {
    slug: "conditioners",
    name: "Conditioners",
    headline: "Rinse-Out & Leave-In Conditioners",
    description: "High-slip botanical conditioning emulsions that melt tangles, smooth the cuticle surface, and restore softness.",
    productCount: 2,
    metaTitle: "Restorative Botanical Conditioners | Slimky Hair",
    metaDescription: "Experience intense slip, detangling ease, and deep moisture sealing with our botanical conditioning rinses."
  },
  {
    slug: "hair-creams",
    name: "Hair Creams",
    headline: "Daily Hydrating Creams",
    description: "Water-based leave-in moisturizing lotions designed to hydrate thirsty coils, define waves, and maintain everyday elasticity.",
    productCount: 2,
    metaTitle: "Daily Hydrating Hair Creams | Slimky Hair",
    metaDescription: "Quench dry textures with lightweight, nutrient-rich botanical hair creams for defined, supple strands."
  },
  {
    slug: "hair-butters",
    name: "Hair Butters",
    headline: "Rich Sealing Butters",
    description: "Decadent unrefined shea and cupuaçu plant butters whipped to lock in moisture, prevent split ends, and nurture protective styles.",
    productCount: 2,
    metaTitle: "Rich Botanical Hair Butters | Slimky Hair",
    metaDescription: "Seal in long-lasting moisture and protect delicate ends with whipped, whole-plant botanical hair butters."
  },
  {
    slug: "hair-masks",
    name: "Hair Masks",
    headline: "Intensive Treatment Masks",
    description: "Weekly restorative masks packed with plant amino acids, squalane, and ceramides to deeply replenish stressed, brittle hair.",
    productCount: 2,
    metaTitle: "Deep Conditioning Hair Masks | Slimky Hair",
    metaDescription: "Rejuvenate stressed textures with intensive botanical treatment masks formulated for deep hydration and slip."
  },
  {
    slug: "scalp-treatments",
    name: "Scalp Treatments",
    headline: "Targeted Scalp Elixirs",
    description: "Balancing scalp drops and serums formulated with soothing herbal extracts to calm dryness and sustain a healthy scalp foundation.",
    productCount: 1,
    metaTitle: "Botanical Scalp Treatments | Slimky Hair",
    metaDescription: "Support your hair at the root with clarifying and soothing botanical scalp treatments designed for sensitive skin."
  },
  {
    slug: "styling-products",
    name: "Styling Products",
    headline: "Flexible Hold & Definition",
    description: "Alcohol-free botanical gels, curling custards, and edge defining balms for flake-free hold and luminous definition.",
    productCount: 2,
    metaTitle: "Botanical Styling Products & Edge Control | Slimky Hair",
    metaDescription: "Shape, sculpt, and set your favorite styles with flexible-hold botanical gels and edge definition balms."
  }
];

export const PRODUCTS = [
  // 1. Hair Oils
  {
    id: "prod-01",
    slug: "nourishing-scalp-oil",
    name: "Nourishing Scalp & Hair Oil",
    category: "Hair Oils",
    categorySlug: "hair-oils",
    productType: "Hair Oil",
    descriptor: "Lightweight, nutrient-dense botanical oil blend engineered to fortify roots and seal moisture.",
    badge: { text: "Bestseller", class: "badge-dark" },
    featured: true,
    bestseller: true,
    rating: 4.9,
    reviewCount: 48,
    hairTypes: ["Curly", "Coily", "Wavy", "Straight", "Chemically Treated", "Color Treated"],
    scalpTypes: ["Normal", "Dry", "Sensitive"],
    concerns: ["Dryness", "Dullness", "Frizz", "Split Ends"],
    ingredientsShort: "Jojoba, Baobab, Kalahari Melon, Rosemary Extract",
    ingredientsINCI: "Simmondsia Chinensis (Jojoba) Seed Oil, Adansonia Digitata (Baobab) Seed Oil, Citrullus Lanatus (Kalahari Melon) Seed Oil, Caprylic/Capric Triglyceride, Squalane, Tocopherol (Vitamin E), Rosmarinus Officinalis (Rosemary) Leaf Extract, Lavandula Angustifolia (Lavender) Oil.",
    benefits: [
      "Seals in essential moisture without weighing down fine or coarse textures",
      "Soothes dry, tight scalp sensations with lightweight plant lipids",
      "Imparts a luminous, natural gloss to dull and dry hair strands",
      "Helps protect fragile ends from everyday mechanical friction"
    ],
    suitableFor: "All hair textures seeking weightless daily moisture sealing and gentle scalp nourishment.",
    netWeight: "50ml / 1.7 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Subtle natural herbal scent from organic rosemary and lavender extract",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens & phthalates",
    essentialOils: "Contains < 0.3% pure rosemary and lavender essential oils",
    usageInstructions: [
      { step: "01", title: "Dispense", text: "Apply 3 to 5 drops directly to parted scalp sections using the precision glass dropper." },
      { step: "02", title: "Massage", text: "Gently massage into the scalp with clean fingertips in circular motions for 2 to 3 minutes." },
      { step: "03", title: "Seal", text: "Smooth remaining oil down the length of damp or dry hair, focusing on fragile ends." }
    ],
    safetyInformation: "For external cosmetic use only. Avoid direct contact with eyes. Discontinue use if irritation occurs. Store in a cool, dry place away from direct sunlight.",
    images: {
      packaging: "assets/placeholders/products/oil-dropper-bottle.jpg",
      ingredients: "assets/placeholders/products/oil-dropper-bottle.jpg",
      texture: "assets/placeholders/lifestyle/campaign-lifestyle.jpg"
    },
    variants: [
      { size: "50ml", priceFormatted: "₦38,000", priceValue: 38000, sku: "SLM-OIL-050", stock: 24, availability: "In Stock" },
      { size: "100ml", priceFormatted: "₦62,000", priceValue: 62000, sku: "SLM-OIL-100", stock: 12, availability: "In Stock" }
    ],
    reviews: [
      { author: "Chioma E.", date: "August 2026", rating: 5, verified: true, title: "Lightweight and truly hydrating", text: "This oil has completely transformed my dry scalp routine. It does not feel greasy at all and absorbs wonderfully into my 4C curls." },
      { author: "Folake A.", date: "July 2026", rating: 5, verified: true, title: "Great slip and sheen", text: "I use this right after my leave-in conditioner. It locks in hydration for days and has a calm, spa-like scent." },
      { author: "Zainab M.", date: "June 2026", rating: 4, verified: true, title: "Soothing on protective styles", text: "Perfect for oiling parts while wearing braids. Kept my scalp calm and clean throughout the month." }
    ],
    createdAt: "2026-01-10"
  },
  {
    id: "prod-02",
    slug: "botanical-shine-elixir",
    name: "Botanical Golden Sheen Elixir",
    category: "Hair Oils",
    categorySlug: "hair-oils",
    productType: "Hair Oil",
    descriptor: "Fast-absorbing glossing treatment that softens hair cuticles and combats environmental dryness.",
    badge: { text: "Essential", class: "badge-sage" },
    featured: false,
    bestseller: false,
    rating: 4.8,
    reviewCount: 31,
    hairTypes: ["Curly", "Wavy", "Straight", "Color Treated"],
    scalpTypes: ["Normal", "Oily"],
    concerns: ["Dullness", "Frizz", "Humidity"],
    ingredientsShort: "Argan, Marula, Camellia Seed Oil, Vitamin E",
    ingredientsINCI: "Camellia Japonica Seed Oil, Sclerocarya Birrea (Marula) Seed Oil, Argania Spinosa (Argan) Kernel Oil, Coco-Caprylate, Helianthus Annuus Seed Oil, Tocopherol, Citrus Aurantium Dulcis Peel Oil.",
    benefits: [
      "Provides instant reflective shine without silicone buildup",
      "Smooths flyaways and tames humidity-induced frizz",
      "Leaves hair touchably soft and manageable throughout the day"
    ],
    suitableFor: "Fine to medium textures looking for a weightless finishing sheen.",
    netWeight: "60ml / 2.0 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Gentle citrus and floral notes from cold-pressed peel extracts",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Contains minimal cold-pressed sweet orange extract",
    usageInstructions: [
      { step: "01", title: "Warm", text: "Rub 2 to 3 drops between the palms of your hands to warm the golden botanical oils." },
      { step: "02", title: "Distribute", text: "Lightly sweep hands over styled, dry hair from mid-lengths to the ends." }
    ],
    safetyInformation: "External cosmetic use only. Keep away from open flame. Avoid eye contact.",
    images: {
      packaging: "assets/placeholders/products/oil-dropper-bottle.jpg",
      ingredients: "assets/placeholders/products/oil-dropper-bottle.jpg",
      texture: "assets/placeholders/lifestyle/campaign-lifestyle.jpg"
    },
    variants: [
      { size: "60ml", priceFormatted: "₦34,000", priceValue: 34000, sku: "SLM-GLS-060", stock: 18, availability: "In Stock" }
    ],
    reviews: [
      { author: "Nneka O.", date: "August 2026", rating: 5, verified: true, title: "Mirror-like shine", text: "A tiny drop goes a very long way. My silk press looks luminous without feeling heavy." }
    ],
    createdAt: "2026-02-15"
  },
  {
    id: "prod-03",
    slug: "castor-strengthening-hair-oil",
    name: "Pure Castor Fortifying Oil",
    category: "Hair Oils",
    categorySlug: "hair-oils",
    productType: "Hair Oil",
    descriptor: "Dense, nutrient-packed cold-pressed seed oil formulated for edge support and protective style care.",
    badge: null,
    featured: false,
    bestseller: false,
    rating: 4.7,
    reviewCount: 22,
    hairTypes: ["Coily", "Curly", "Chemically Treated"],
    scalpTypes: ["Dry", "Normal"],
    concerns: ["Fragile Edges", "Breakage", "Severe Dryness"],
    ingredientsShort: "Ricinus Communis (Castor) Seed Oil, Nigella Sativa (Black Seed) Oil",
    ingredientsINCI: "Ricinus Communis (Castor) Seed Oil, Nigella Sativa (Black Seed) Oil, Tocopheryl Acetate.",
    benefits: [
      "Provides heavy sealing barrier for high porosity coils and fragile edges",
      "Locks in moisture for multiple days during protective styling",
      "Rich in fatty acids to condition dry, coarse textures"
    ],
    suitableFor: "Coily and high-porosity hair types needing deep moisture retention.",
    netWeight: "100ml / 3.4 fl oz",
    shelfLife: "18M after opening",
    fragrance: "100% Unfragranced natural earthy aroma",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Zero essential oils",
    usageInstructions: [
      { step: "01", title: "Target", text: "Apply sparingly to fragile hairlines, nape, and ends." },
      { step: "02", title: "Smooth", text: "Gently smooth along the hairline using fingertips or a soft bristle brush." }
    ],
    safetyInformation: "External use only. Discontinue if redness occurs.",
    images: {
      packaging: "assets/placeholders/products/oil-dropper-bottle.jpg",
      ingredients: "assets/placeholders/products/oil-dropper-bottle.jpg",
      texture: "assets/placeholders/lifestyle/campaign-lifestyle.jpg"
    },
    variants: [
      { size: "100ml", priceFormatted: "₦28,000", priceValue: 28000, sku: "SLM-CST-100", stock: 15, availability: "In Stock" }
    ],
    reviews: [
      { author: "Halima B.", date: "July 2026", rating: 5, verified: true, title: "Great for edges", text: "Thick, rich, and deeply conditioning. Exactly what my hairline needed under wigs." }
    ],
    createdAt: "2026-03-01"
  },

  // 2. Shampoo & Cleansers
  {
    id: "prod-04",
    slug: "botanical-hydrating-shampoo",
    name: "Botanical Hydrating Shampoo",
    category: "Shampoo & Cleansers",
    categorySlug: "shampoo",
    productType: "Shampoo",
    descriptor: "Non-stripping scalp cleansing formula that purifies without compromising delicate natural lipid layers.",
    badge: { text: "Sulfate-Free", class: "badge-outline" },
    featured: true,
    bestseller: true,
    rating: 4.8,
    reviewCount: 39,
    hairTypes: ["All Hair Types", "Curly", "Coily", "Wavy", "Straight", "Color Treated"],
    scalpTypes: ["Normal", "Dry", "Sensitive"],
    concerns: ["Buildup", "Dry Scalp", "Tangled Wash Days"],
    ingredientsShort: "Aloe Vera Leaf Juice, Decyl Glucoside, Marshmallow Root, Panthenol",
    ingredientsINCI: "Aqua (Water), Aloe Barbadensis Leaf Juice, Decyl Glucoside, Sodium Cocoyl Isethionate, Glycerin, Althaea Officinalis (Marshmallow) Root Extract, Panthenol (Pro-Vitamin B5), Citric Acid, Potassium Sorbate.",
    benefits: [
      "Effortlessly removes daily oil and residue without leaving strands squeaky or brittle",
      "High-slip marshmallow root extract prevents wash-day tangling",
      "Maintains the scalp's natural acid mantle and moisture barrier"
    ],
    suitableFor: "All curl patterns and hair types seeking a gentle, hydrating cleanse.",
    netWeight: "250ml / 8.5 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Gentle natural botanical scent",
    sulfates: "100% Sulfate-Free (Gentle coconut-derived cleansers)",
    parabens: "Free from parabens",
    essentialOils: "Free from irritating essential oils",
    usageInstructions: [
      { step: "01", title: "Drench", text: "Thoroughly saturate hair with warm water for 1 full minute." },
      { step: "02", title: "Lather", text: "Apply 1-2 pumps directly to scalp and massage into a creamy botanical foam." },
      { step: "03", title: "Rinse", text: "Rinse thoroughly with warm water, allowing the lather to cleanse strands downward." }
    ],
    safetyInformation: "External use only. Avoid contact with eyes. In case of eye contact, rinse immediately with clean water.",
    images: {
      packaging: "assets/placeholders/products/shampoo-pump-bottle.jpg",
      ingredients: "assets/placeholders/products/shampoo-pump-bottle.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "250ml", priceFormatted: "₦32,000", priceValue: 32000, sku: "SLM-SHP-250", stock: 28, availability: "In Stock" },
      { size: "500ml", priceFormatted: "₦54,000", priceValue: 54000, sku: "SLM-SHP-500", stock: 14, availability: "In Stock" }
    ],
    reviews: [
      { author: "Amara K.", date: "July 2026", rating: 5, verified: true, title: "Wash day game changer", text: "My 4B hair detangled while washing! No stripped feeling at all." }
    ],
    createdAt: "2026-01-20"
  },
  {
    id: "prod-05",
    slug: "clarifying-scalp-shampoo",
    name: "Clarifying Herbal Scalp Wash",
    category: "Shampoo & Cleansers",
    categorySlug: "shampoo",
    productType: "Shampoo",
    descriptor: "Gentle clarifying wash infused with green tea and apple cider vinegar to lift heavy butter and styling residue.",
    badge: { text: "New", class: "badge-clinical" },
    featured: false,
    bestseller: false,
    rating: 4.9,
    reviewCount: 18,
    hairTypes: ["Curly", "Coily", "Wavy", "Straight"],
    scalpTypes: ["Oily", "Normal"],
    concerns: ["Heavy Buildup", "Dull Hair", "Clogged Pores"],
    ingredientsShort: "Apple Cider Vinegar, Green Tea Extract, Peppermint Leaf Oil",
    ingredientsINCI: "Aqua, Lauryl Glucoside, Acetum (Apple Cider Vinegar), Camellia Sinensis (Green Tea) Leaf Extract, Mentha Piperita (Peppermint) Oil, Polyquaternium-10, Benzyl Alcohol.",
    benefits: [
      "Clarifies stubborn wax and butter buildup to reset natural curl spring",
      "Restores scalp balance with gentle fruit acidity",
      "Provides a clean, cooling sensory wash day experience"
    ],
    suitableFor: "Those who regularly use heavy butters or suffer from quick scalp oiliness.",
    netWeight: "250ml / 8.5 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Fresh herbal peppermint",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Contains natural peppermint oil",
    usageInstructions: [
      { step: "01", title: "Apply", text: "Use once every 2-3 weeks or after taking down protective styles." },
      { step: "02", title: "Rinse", text: "Rinse with lukewarm water and follow immediately with a rich conditioner." }
    ],
    safetyInformation: "External cosmetic use only. Avoid contact with broken skin or eyes.",
    images: {
      packaging: "assets/placeholders/products/shampoo-pump-bottle.jpg",
      ingredients: "assets/placeholders/products/shampoo-pump-bottle.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "250ml", priceFormatted: "₦36,000", priceValue: 36000, sku: "SLM-CLR-250", stock: 10, availability: "In Stock" }
    ],
    reviews: [
      { author: "Kemi T.", date: "June 2026", rating: 5, verified: true, title: "Total scalp reset", text: "Lifts all the edge control and gel buildup without drying my hair out." }
    ],
    createdAt: "2026-03-12"
  },

  // 3. Conditioners
  {
    id: "prod-06",
    slug: "restorative-hair-conditioner",
    name: "Restorative Botanical Conditioner",
    category: "Conditioners",
    categorySlug: "conditioners",
    productType: "Conditioner",
    descriptor: "Intense conditioning rinse that seals cuticles, softens coily strands, and restores natural suppleness.",
    badge: { text: "New Formulation", class: "badge-clinical" },
    featured: true,
    bestseller: false,
    rating: 4.9,
    reviewCount: 33,
    hairTypes: ["Curly", "Coily", "Wavy", "Chemically Treated"],
    scalpTypes: ["Normal", "Dry", "Sensitive"],
    concerns: ["Knots", "Rough Texture", "Moisture Loss"],
    ingredientsShort: "Behentrimonium Methosulfate, Cetearyl Alcohol, Hibiscus Extract, Mongongo Oil",
    ingredientsINCI: "Aqua, Cetearyl Alcohol, Behentrimonium Methosulfate, Schinziophyton Rautanenii (Mongongo) Kernel Oil, Hibiscus Sabdariffa Flower Extract, Hydrolyzed Wheat Protein, Lactic Acid, Dehydroacetic Acid.",
    benefits: [
      "Immediate finger-slip detangling that cuts wash day time in half",
      "Locks moisture inside the cortex while smoothing down hair cuticles",
      "Leaves curls pliable, bouncy, and ready for styling"
    ],
    suitableFor: "All hair textures requiring effortless detangling and lasting hydration.",
    netWeight: "250ml / 8.5 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Delicate hibiscus and floral notes",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Mild botanical extract blend",
    usageInstructions: [
      { step: "01", title: "Saturate", text: "Apply generously to freshly cleansed, wet hair from ends upward." },
      { step: "02", title: "Detangle", text: "Gently finger detangle or use a wide-tooth comb starting at the tips." },
      { step: "03", title: "Rinse", text: "Allow to sit for 3 to 5 minutes, then rinse thoroughly with cool water." }
    ],
    safetyInformation: "For external use only. Keep out of reach of children.",
    images: {
      packaging: "assets/placeholders/products/conditioner-bottle.jpg",
      ingredients: "assets/placeholders/products/conditioner-bottle.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "250ml", priceFormatted: "₦36,000", priceValue: 36000, sku: "SLM-CND-250", stock: 22, availability: "In Stock" },
      { size: "500ml", priceFormatted: "₦58,000", priceValue: 58000, sku: "SLM-CND-500", stock: 9, availability: "Low Stock" }
    ],
    reviews: [
      { author: "Blessing U.", date: "August 2026", rating: 5, verified: true, title: "The slip is unmatched", text: "My comb glided through my hair like butter. Highly recommend!" }
    ],
    createdAt: "2026-02-01"
  },
  {
    id: "prod-07",
    slug: "nourishing-leave-in-conditioner",
    name: "Nourishing Leave-In Conditioning Mist",
    category: "Conditioners",
    categorySlug: "conditioners",
    productType: "Leave-in",
    descriptor: "Weightless priming spray that primes coils for moisture, softens textures, and minimizes friction.",
    badge: null,
    featured: false,
    bestseller: false,
    rating: 4.8,
    reviewCount: 27,
    hairTypes: ["Curly", "Coily", "Wavy", "Straight", "Color Treated"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Daily Dryness", "Mid-week Refresh", "Tangles"],
    ingredientsShort: "Rose Flower Water, Aloe Vera Juice, Bamboo Extract, Vegetable Glycerin",
    ingredientsINCI: "Aqua, Rosa Damascena Flower Water, Aloe Barbadensis Leaf Juice, Glycerin, Bambusa Vulgaris (Bamboo) Extract, Polysorbate 20, Sodium Benzoate, Citric Acid.",
    benefits: [
      "Instantly rehydrates thirsty hair between wash days",
      "Prepares hair for creams and butters as part of the LOC/LGO method",
      "Weightless formula that never flakes or builds up"
    ],
    suitableFor: "Daily moisture refreshing on all natural and relaxed hair types.",
    netWeight: "200ml / 6.7 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Fresh botanical rosewater",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Free from strong synthetic fragrance",
    usageInstructions: [
      { step: "01", title: "Spritz", text: "Mist evenly over damp or dry hair before styling or refreshing." },
      { step: "02", title: "Work Through", text: "Gently smooth into strands with palms to reactivate natural curl pattern." }
    ],
    safetyInformation: "External use only. Avoid spraying directly into eyes.",
    images: {
      packaging: "assets/placeholders/products/conditioner-bottle.jpg",
      ingredients: "assets/placeholders/products/conditioner-bottle.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "200ml", priceFormatted: "₦30,000", priceValue: 30000, sku: "SLM-LIV-200", stock: 19, availability: "In Stock" }
    ],
    reviews: [
      { author: "Damilola A.", date: "July 2026", rating: 5, verified: true, title: "Essential for morning refresh", text: "Brings my twist-out right back to life without making it wet or shrinking it too much." }
    ],
    createdAt: "2026-03-05"
  },

  // 4. Hair Creams
  {
    id: "prod-08",
    slug: "rich-moisture-cream",
    name: "Rich Botanical Moisture Cream",
    category: "Hair Creams",
    categorySlug: "hair-creams",
    productType: "Hair Cream",
    descriptor: "Ultra-hydrating leave-in botanical cream designed for high slip, definition and coil elasticity.",
    badge: { text: "Essential", class: "badge-sage" },
    featured: true,
    bestseller: true,
    rating: 5.0,
    reviewCount: 42,
    hairTypes: ["Curly", "Coily", "Chemically Treated"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Extreme Dryness", "Lack of Definition", "Stiffness"],
    ingredientsShort: "Nilotica Shea Butter, Cupuaçu Butter, Meadowfoam Seed Oil, Flaxseed Gel",
    ingredientsINCI: "Aqua, Butyrospermum Parkii (Nilotica Shea) Butter, Theobroma Grandiflorum (Cupuaçu) Seed Butter, Cetyl Alcohol, Limnanthes Alba (Meadowfoam) Seed Oil, Linum Usitatissimum (Flaxseed) Extract, Xanthan Gum, Phenoxyethanol, Ethylhexylglycerin.",
    benefits: [
      "Provides sustained multi-day hydration for thick, high-density hair",
      "Softens coarse textures and enhances natural curl clump elasticity",
      "Protects against environmental moisture loss in dry or humid climates"
    ],
    suitableFor: "Thick, coily, and tight curl patterns needing rich, lasting daily moisture.",
    netWeight: "200ml / 6.7 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Gentle natural nutty-botanical aroma",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Free from synthetic perfumes",
    usageInstructions: [
      { step: "01", title: "Section", text: "Divide damp hair into four manageable quadrants." },
      { step: "02", title: "Apply", text: "Rake a small coin-sized amount through each section from roots to ends." },
      { step: "03", title: "Style", text: "Twist, braid, or air-dry as desired for soft, defined hold." }
    ],
    safetyInformation: "External cosmetic use only. Patch test before first use.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "200ml", priceFormatted: "₦38,000", priceValue: 38000, sku: "SLM-CRM-200", stock: 30, availability: "In Stock" },
      { size: "400ml", priceFormatted: "₦64,000", priceValue: 64000, sku: "SLM-CRM-400", stock: 16, availability: "In Stock" }
    ],
    reviews: [
      { author: "Eseosa I.", date: "August 2026", rating: 5, verified: true, title: "Holy grail for 4C hair", text: "I have never had a cream keep my hair soft for 4 days straight until this one." }
    ],
    createdAt: "2026-01-15"
  },
  {
    id: "prod-09",
    slug: "daily-hydrating-lotion",
    name: "Daily Hydrating Botanical Lotion",
    category: "Hair Creams",
    categorySlug: "hair-creams",
    productType: "Hair Cream",
    descriptor: "Featherlight daily moisturizing lotion that softens strands and smooths waves without buildup.",
    badge: null,
    featured: false,
    bestseller: false,
    rating: 4.7,
    reviewCount: 19,
    hairTypes: ["Wavy", "Curly", "Straight", "Color Treated"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Frizz", "Dry Mid-Lengths", "Flyaways"],
    ingredientsShort: "Almond Oil, Oat Kernel Milk, Aloe Extract, Glyceryl Stearate",
    ingredientsINCI: "Aqua, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Avena Sativa (Oat) Kernel Flour, Aloe Barbadensis Leaf Extract, Glyceryl Stearate, Cetearyl Glucoside, Tocopherol, Benzyl Alcohol.",
    benefits: [
      "Absorbs in seconds without leaving a greasy or tacky film",
      "Softens fine and medium hair types without deflating volume",
      "Ideal primer under blowouts and heat styling"
    ],
    suitableFor: "Medium to fine curl types, loose waves, and straight textures.",
    netWeight: "200ml / 6.7 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Delicate oat and almond natural scent",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Zero synthetic fragrances",
    usageInstructions: [
      { step: "01", title: "Pump", text: "Dispense 1-2 pumps onto damp hair." },
      { step: "02", title: "Smooth", text: "Smooth down strands from mid-shaft to ends before combing through." }
    ],
    safetyInformation: "External use only. Avoid contact with eyes.",
    images: {
      packaging: "assets/placeholders/products/conditioner-bottle.jpg",
      ingredients: "assets/placeholders/products/conditioner-bottle.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "200ml", priceFormatted: "₦32,000", priceValue: 32000, sku: "SLM-LTN-200", stock: 20, availability: "In Stock" }
    ],
    reviews: [
      { author: "Yetunde F.", date: "July 2026", rating: 5, verified: true, title: "Light and moisturizing", text: "Great for my 3A curls. Gives bounce without heaviness." }
    ],
    createdAt: "2026-03-20"
  },

  // 5. Hair Butters
  {
    id: "prod-10",
    slug: "whipped-shea-hair-butter",
    name: "Whipped Botanical Shea Butter",
    category: "Hair Butters",
    categorySlug: "hair-butters",
    productType: "Butter",
    descriptor: "Air-whipped raw shea and avocado butter to lock in deep hydration on dense, coarse coils.",
    badge: { text: "Bestseller", class: "badge-dark" },
    featured: false,
    bestseller: true,
    rating: 4.9,
    reviewCount: 37,
    hairTypes: ["Coily", "Curly", "Chemically Treated"],
    scalpTypes: ["Dry"],
    concerns: ["Chronic Dryness", "Breakage at Ends", "Twist-outs"],
    ingredientsShort: "East African Nilotica Shea, Persea Gratissima (Avocado) Butter, Argan Oil",
    ingredientsINCI: "Butyrospermum Parkii Butter, Persea Gratissima Butter, Argania Spinosa Kernel Oil, Vitis Vinifera (Grape) Seed Oil, Tocopherol.",
    benefits: [
      "Rich emollient seal that guards against severe moisture loss",
      "Gives high definition and sheen to protective braids, twists, and locs",
      "Softens rough hair ends to reduce the appearance of split ends"
    ],
    suitableFor: "Type 4 coils, high porosity hair, and dry protective styling.",
    netWeight: "180ml / 6.1 fl oz",
    shelfLife: "18M after opening",
    fragrance: "Warm, subtle natural roasted shea aroma",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "100% natural, unfragranced",
    usageInstructions: [
      { step: "01", title: "Melt", text: "Melt a pea-sized amount between warm palms until completely translucent." },
      { step: "02", title: "Seal", text: "Press into damp hair following your water or cream-based leave-in." }
    ],
    safetyInformation: "External cosmetic use only. Keep jar in a cool place to prevent melting.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "180ml", priceFormatted: "₦36,000", priceValue: 36000, sku: "SLM-BTR-180", stock: 25, availability: "In Stock" }
    ],
    reviews: [
      { author: "Chidimma N.", date: "August 2026", rating: 5, verified: true, title: "Melts like butter", text: "Not gritty at all! Completely smooth and gives my mini twists intense shine." }
    ],
    createdAt: "2026-02-10"
  },
  {
    id: "prod-11",
    slug: "mango-cupuacu-curl-butter",
    name: "Mango & Cupuaçu Sealing Balm",
    category: "Hair Butters",
    categorySlug: "hair-butters",
    productType: "Butter",
    descriptor: "Silky plant butter blend that shields strands and imparts silky softness with zero greasy residue.",
    badge: null,
    featured: false,
    bestseller: false,
    rating: 4.8,
    reviewCount: 20,
    hairTypes: ["Curly", "Coily"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Frizz", "Rough Cuticle", "Lack of Elasticity"],
    ingredientsShort: "Mangifera Indica (Mango) Seed Butter, Theobroma Grandiflorum Seed Butter, Jojoba Esters",
    ingredientsINCI: "Mangifera Indica Seed Butter, Theobroma Grandiflorum Seed Butter, Jojoba Esters, Squalane, Tocopherol.",
    benefits: [
      "Ultra-soft butter with high water-retention capacity",
      "Leaves hair supple and pliable without stiffness",
      "Locks in moisture without weighing down bouncy curls"
    ],
    suitableFor: "Curly and coily hair textures seeking a lighter butter formulation.",
    netWeight: "150ml / 5.1 fl oz",
    shelfLife: "18M after opening",
    fragrance: "Gentle tropical natural mango seed scent",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Zero synthetic fragrances",
    usageInstructions: [
      { step: "01", title: "Smooth", text: "Apply sparingly over braids or twists to lock in moisture and gloss." }
    ],
    safetyInformation: "External cosmetic use only. Avoid open flames.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "150ml", priceFormatted: "₦34,000", priceValue: 34000, sku: "SLM-MNG-150", stock: 14, availability: "In Stock" }
    ],
    reviews: [
      { author: "Funke P.", date: "July 2026", rating: 5, verified: true, title: "Smells wonderful and softens hair", text: "Keeps my ends soft for days. Love the smooth texture." }
    ],
    createdAt: "2026-03-18"
  },

  // 6. Hair Masks
  {
    id: "prod-12",
    slug: "deep-moisture-repair-mask",
    name: "Deep Botanical Restorative Mask",
    category: "Hair Masks",
    categorySlug: "hair-masks",
    productType: "Mask",
    descriptor: "Weekly intensive botanical treatment that replenishes lost moisture, fortifies cuticles, and restores bounce.",
    badge: { text: "Essential", class: "badge-sage" },
    featured: false,
    bestseller: false,
    rating: 4.9,
    reviewCount: 38,
    hairTypes: ["Curly", "Coily", "Wavy", "Chemically Treated", "Color Treated"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Severe Dryness", "Breakage", "Color Damage"],
    ingredientsShort: "Hydrolyzed Quinoa, Baobab Protein, Shea Butter, Ceramides",
    ingredientsINCI: "Aqua, Cetearyl Alcohol, Butyrospermum Parkii Butter, Hydrolyzed Quinoa, Hydrolyzed Adansonia Digitata Seed Extract, Ceramide NP, Behentrimonium Chloride, Lactic Acid, Benzyl Alcohol.",
    benefits: [
      "Penetrates deep into the hair shaft to revive dry, over-processed strands",
      "Plant ceramides replenish lost lipid cement between hair cuticle layers",
      "Restores elasticity to reduce breakage from brushing and styling"
    ],
    suitableFor: "Weekly replenishment for chemically treated, color treated, or heat-fatigued hair.",
    netWeight: "250ml / 8.5 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Warm herbaceous botanical notes",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Free from harsh essential oils",
    usageInstructions: [
      { step: "01", title: "Apply", text: "Generously coat clean, damp hair from roots to ends after shampooing." },
      { step: "02", title: "Cover", text: "Cover with a warm shower cap or steam cap for 15 to 20 minutes." },
      { step: "03", title: "Rinse", text: "Rinse thoroughly with cool water to seal the conditioned hair cuticle." }
    ],
    safetyInformation: "For external cosmetic use only. If irritation develops, discontinue use.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "250ml", priceFormatted: "₦42,000", priceValue: 42000, sku: "SLM-MSK-250", stock: 18, availability: "In Stock" },
      { size: "500ml", priceFormatted: "₦72,000", priceValue: 72000, sku: "SLM-MSK-500", stock: 7, availability: "Low Stock" }
    ],
    reviews: [
      { author: "Tariere B.", date: "August 2026", rating: 5, verified: true, title: "Saved my bleached curls", text: "I have color-treated hair and this mask made it feel like virgin hair again. Unbelievable slip." }
    ],
    createdAt: "2026-02-05"
  },
  {
    id: "prod-13",
    slug: "protein-balance-strengthening-mask",
    name: "Fortifying Botanical Protein Treatment",
    category: "Hair Masks",
    categorySlug: "hair-masks",
    productType: "Mask",
    descriptor: "Targeted amino acid treatment to support structural integrity and minimize shedding from weak strands.",
    badge: null,
    featured: false,
    bestseller: false,
    rating: 4.8,
    reviewCount: 23,
    hairTypes: ["Curly", "Coily", "Chemically Treated", "Color Treated"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Limp Curls", "Excessive Shedding", "Heat Damage"],
    ingredientsShort: "Wheat Amino Acids, Soy Amino Acids, Arginine, Jojoba Oil",
    ingredientsINCI: "Aqua, Cetearyl Alcohol, Wheat Amino Acids, Soy Amino Acids, Arginine HCl, Serine, Threonine, Simmondsia Chinensis Seed Oil, Hydroxyethylcellulose, Potassium Sorbate.",
    benefits: [
      "Restores curl spring and structure to mushy, over-moisturized strands",
      "Reinforces the cortex against mechanical snapping and combing friction",
      "Balances moisture-protein equilibrium for resilient curls"
    ],
    suitableFor: "Hair lacking elasticity, experiencing high breakage, or over-conditioned textures.",
    netWeight: "200ml / 6.7 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Clean, unscented formula",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Fragrance-free formula",
    usageInstructions: [
      { step: "01", title: "Distribute", text: "Apply evenly to damp hair and let sit for 10-15 minutes." },
      { step: "02", title: "Rinse", text: "Rinse completely and follow with a moisturizing conditioner." }
    ],
    safetyInformation: "External cosmetic use only. Use once every 4 to 6 weeks.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "200ml", priceFormatted: "₦38,000", priceValue: 38000, sku: "SLM-PRT-200", stock: 12, availability: "In Stock" }
    ],
    reviews: [
      { author: "Kanyinsola L.", date: "July 2026", rating: 5, verified: true, title: "Brought my curls back", text: "My curls were stretching out and limp. This treatment brought back their spring immediately." }
    ],
    createdAt: "2026-03-22"
  },

  // 7. Scalp Treatments
  {
    id: "prod-14",
    slug: "soothing-scalp-serum",
    name: "Calming Botanical Scalp Elixir",
    category: "Scalp Treatments",
    categorySlug: "scalp-treatments",
    productType: "Scalp Treatment",
    descriptor: "Cooling, water-based botanical serum with aloe, tea tree, and niacinamide to refresh tight scalps.",
    badge: { text: "New", class: "badge-clinical" },
    featured: false,
    bestseller: false,
    rating: 4.9,
    reviewCount: 26,
    hairTypes: ["All Hair Types", "Curly", "Coily", "Straight"],
    scalpTypes: ["Sensitive", "Dry", "Oily"],
    concerns: ["Tight Scalp", "Dry Flakes", "Irritation from Braids"],
    ingredientsShort: "Aloe Juice, Niacinamide, Chamomile Extract, Tea Tree Leaf Oil",
    ingredientsINCI: "Aloe Barbadensis Leaf Juice, Aqua, Niacinamide, Glycerin, Chamomilla Recutita (Matricaria) Flower Extract, Melaleuca Alternifolia (Tea Tree) Leaf Oil, Allantoin, Xanthan Gum, Phenoxyethanol.",
    benefits: [
      "Instantly relieves scalp tightness and discomfort from braids or styling",
      "Soothes sensitive, dry scalp areas without heavy residue",
      "Water-based non-oily formula dries down completely clean"
    ],
    suitableFor: "Scalps prone to irritation under protective styles or post-wash dryness.",
    netWeight: "50ml / 1.7 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Crisp, clean herbal aroma with subtle tea tree",
    sulfates: "Free from sulfates",
    parabens: "Free from parabens",
    essentialOils: "Contains < 0.1% pure tea tree extract",
    usageInstructions: [
      { step: "01", title: "Target", text: "Apply 2-3 dropper drops directly to sensitive or itchy scalp areas." },
      { step: "02", title: "Tap", text: "Gently tap in with fingertips without rubbing vigorously." }
    ],
    safetyInformation: "External cosmetic use only. Do not apply on open wounds or inflamed lesions.",
    images: {
      packaging: "assets/placeholders/products/oil-dropper-bottle.jpg",
      ingredients: "assets/placeholders/products/oil-dropper-bottle.jpg",
      texture: "assets/placeholders/lifestyle/campaign-lifestyle.jpg"
    },
    variants: [
      { size: "50ml", priceFormatted: "₦36,000", priceValue: 36000, sku: "SLM-SCP-050", stock: 17, availability: "In Stock" }
    ],
    reviews: [
      { author: "Ronke S.", date: "August 2026", rating: 5, verified: true, title: "Immediate relief for braids", text: "I put this on fresh knotless braids and felt instant soothing relief. A must have!" }
    ],
    createdAt: "2026-03-10"
  },

  // 8. Styling Products
  {
    id: "prod-15",
    slug: "botanical-curl-definition-gel",
    name: "Botanical Curl Sculpting Gel",
    category: "Styling Products",
    categorySlug: "styling-products",
    productType: "Styling Cream/Gel",
    descriptor: "Flake-free, alcohol-free botanical curling custard that locks in defined curls with touchable soft hold.",
    badge: { text: "Essential", class: "badge-sage" },
    featured: false,
    bestseller: false,
    rating: 4.8,
    reviewCount: 34,
    hairTypes: ["Curly", "Coily", "Wavy"],
    scalpTypes: ["Normal", "Dry"],
    concerns: ["Frizz", "Undefined Curls", "Flaking Gels"],
    ingredientsShort: "Flaxseed Extract, Agave Nectar, Aloe Barbadensis, Pectin",
    ingredientsINCI: "Aqua, Linum Usitatissimum (Flaxseed) Seed Extract, Agave Tequilana Leaf Extract, Aloe Barbadensis Leaf Juice, Pectin, Glycerin, Dehydroxanthan Gum, Hydroxyethylcellulose, Benzyl Alcohol.",
    benefits: [
      "Provides flexible, crunch-free hold that moves naturally with your hair",
      "Does not leave white flakes, powder, or drying residue",
      "Locks in hydration and seals individual curl clumps against humidity"
    ],
    suitableFor: "Wash-and-go routines, twist-outs, and sleek ponytails.",
    netWeight: "250ml / 8.5 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Subtle fresh botanical scent",
    sulfates: "Free from drying alcohols and sulfates",
    parabens: "Free from parabens",
    essentialOils: "Free from synthetic polymers",
    usageInstructions: [
      { step: "01", title: "Apply Wet", text: "Smooth generously through dripping wet hair in small sections." },
      { step: "02", title: "Define", text: "Rake, scrunch or finger coil to set natural curl geometry." },
      { step: "03", title: "Dry", text: "Air dry or diffuse without touching until hair is 100% dry." }
    ],
    safetyInformation: "External cosmetic use only. Avoid contact with eyes.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "250ml", priceFormatted: "₦32,000", priceValue: 32000, sku: "SLM-GEL-250", stock: 21, availability: "In Stock" }
    ],
    reviews: [
      { author: "Ifeoma D.", date: "August 2026", rating: 5, verified: true, title: "Zero crunch, pure definition", text: "Finally a gel that does not flake on day 3. My curls were defined and bouncy." }
    ],
    createdAt: "2026-02-25"
  },
  {
    id: "prod-16",
    slug: "botanical-edge-control-balm",
    name: "Botanical Edge Smoothing Balm",
    category: "Styling Products",
    categorySlug: "styling-products",
    productType: "Edge Control",
    descriptor: "Nourishing, firm-hold edge styling balm that smooths fragile hairlines without flaking or drying alcohols.",
    badge: { text: "Bestseller", class: "badge-dark" },
    featured: false,
    bestseller: true,
    rating: 4.9,
    reviewCount: 45,
    hairTypes: ["Coily", "Curly", "Wavy", "Straight", "Chemically Treated"],
    scalpTypes: ["Normal", "Dry", "Sensitive"],
    concerns: ["Flyaways", "Sleek Edges", "White Residue"],
    ingredientsShort: "Castor Wax, Candelilla Wax, Jojoba Oil, Agave Extract",
    ingredientsINCI: "Aqua, Ceteareth-25, PEG-7 Glyceryl Cocoate, Ricinus Communis Seed Oil, Euphorbia Cerifera (Candelilla) Wax, Simmondsia Chinensis Seed Oil, Agave Tequilana Leaf Extract, Phenoxyethanol.",
    benefits: [
      "All-day polished hold that resists high tropical humidity",
      "Infused with botanical oils to prevent hairline breakage",
      "Washes out clean with warm water and leaves zero buildup"
    ],
    suitableFor: "Sleeking edges, styling baby hairs, and smoothing flyaways on up-dos.",
    netWeight: "100ml / 3.4 fl oz",
    shelfLife: "12M after opening",
    fragrance: "Gentle natural botanical scent",
    sulfates: "Free from drying alcohols",
    parabens: "Free from parabens",
    essentialOils: "Free from harsh fragrance",
    usageInstructions: [
      { step: "01", title: "Apply", text: "Using an edge brush or fingertips, apply a small amount to clean hairline." },
      { step: "02", title: "Sculpt", text: "Smooth and shape hairs into desired sleek lines." },
      { step: "03", title: "Set", text: "Tie with a silk or satin scarf for 5 minutes for maximum lasting hold." }
    ],
    safetyInformation: "External cosmetic use only. Keep lid tightly closed after use.",
    images: {
      packaging: "assets/placeholders/products/cream-jar.jpg",
      ingredients: "assets/placeholders/products/cream-jar.jpg",
      texture: "assets/placeholders/products/cream-jar.jpg"
    },
    variants: [
      { size: "100ml", priceFormatted: "₦26,000", priceValue: 26000, sku: "SLM-EDG-100", stock: 32, availability: "In Stock" }
    ],
    reviews: [
      { author: "Omotola A.", date: "August 2026", rating: 5, verified: true, title: "Lasts through Lagos heat!", text: "Hands down the best edge control for 4C hair. Does not turn white or melt in humidity." }
    ],
    createdAt: "2026-03-01"
  }
];

export const SEARCH_SUGGESTIONS = {
  categories: [
    { title: "Hair Oils", slug: "hair-oils", count: 3 },
    { title: "Shampoo & Cleansers", slug: "shampoo", count: 2 },
    { title: "Conditioners", slug: "conditioners", count: 2 },
    { title: "Hair Creams", slug: "hair-creams", count: 2 },
    { title: "Hair Butters", slug: "hair-butters", count: 2 },
    { title: "Hair Masks", slug: "hair-masks", count: 2 },
    { title: "Scalp Treatments", slug: "scalp-treatments", count: 1 },
    { title: "Styling Products", slug: "styling-products", count: 2 }
  ],
  hairConcerns: [
    { label: "Dry & Dehydrated Curls", filter: "Dryness" },
    { label: "Scalp Balance & Care", filter: "Dry Scalp" },
    { label: "Frizz & Humidity Protection", filter: "Frizz" },
    { label: "Length Retention & Ends", filter: "Breakage" },
    { label: "High Definition Styling", filter: "Undefined Curls" }
  ],
  popularIngredients: [
    "Jojoba Oil",
    "Nilotica Shea Butter",
    "Marshmallow Root",
    "Baobab Seed Oil",
    "Aloe Vera Juice",
    "Cupuaçu Butter",
    "Rosemary Leaf Extract",
    "Apple Cider Vinegar"
  ]
};

/**
 * Get product by slug
 */
export function getProductBySlug(slug) {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  return PRODUCTS.find(p => p.slug === cleanSlug) || null;
}

/**
 * Get category by slug
 */
export function getCategoryBySlug(slug) {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  return CATEGORIES.find(c => c.slug === cleanSlug) || null;
}

/**
 * Get related products for PDP
 */
export function getRelatedProducts(product, limit = 4) {
  if (!product) return [];
  return PRODUCTS
    .filter(p => p.id !== product.id && (p.categorySlug === product.categorySlug || p.hairTypes.some(h => product.hairTypes.includes(h))))
    .slice(0, limit);
}

// Alias export for consistency
export const CATALOG_PRODUCTS = PRODUCTS;
