// ---------------------------------------------------------------------------
// Data model: restaurants -> menus -> categories -> dishes
//
// Kept as an in-memory seed store so the app runs with zero external
// infrastructure. The shapes mirror what a relational schema would use
// (stable ids + slugs + foreign keys), so swapping this module for a real
// database later is a drop-in change behind getRestaurantBySlug().
// ---------------------------------------------------------------------------

export type Dish = {
  id: string;
  name: string;
  description: string;
  /** Price in minor units (cents) to avoid float rounding. */
  priceCents: number;
  photoUrl: string | null;
};

export type Category = {
  id: string;
  name: string;
  dishes: Dish[];
};

export type Menu = {
  id: string;
  name: string;
  categories: Category[];
};

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  currency: string; // ISO 4217
  menu: Menu;
};

const RESTAURANTS: Restaurant[] = [
  {
    // ---------------------------------------------------------------------
    // PILOT RESTAURANT (SOFA-7)
    // Real, publicly published menu used to prove the product end-to-end.
    // Source: In-N-Out published menu & widely reported US prices, 2025-2026
    // (statesmenu.com, hackthemenu.com). Prices are representative of a
    // standard US location and are the values a pilot operator would confirm
    // during onboarding. See docs/RUNBOOK.md and docs/DEMO.md.
    // ---------------------------------------------------------------------
    id: "rest_pilot",
    slug: "pilot-diner",
    name: "The Pilot Diner",
    tagline: "Fresh burgers, hand-cut fries, real ice-cream shakes",
    currency: "USD",
    menu: {
      id: "menu_pilot",
      name: "All Day",
      categories: [
        {
          id: "pcat_1",
          name: "Burgers",
          dishes: [
            {
              id: "pdish_1",
              name: "Double-Double",
              description: "Two beef patties, two slices of cheese, lettuce, tomato, spread.",
              priceCents: 495,
              photoUrl:
                "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=640&q=70",
            },
            {
              id: "pdish_2",
              name: "Cheeseburger",
              description: "Single beef patty, American cheese, lettuce, tomato, spread.",
              priceCents: 345,
              photoUrl:
                "https://images.unsplash.com/photo-1550547660-d9450f859349?w=640&q=70",
            },
            {
              id: "pdish_3",
              name: "Hamburger",
              description: "Single beef patty, lettuce, tomato, spread. No cheese.",
              priceCents: 245,
              photoUrl: null,
            },
          ],
        },
        {
          id: "pcat_2",
          name: "Fries & Sides",
          dishes: [
            {
              id: "pdish_4",
              name: "Fries",
              description: "Whole potatoes, hand-cut and cooked in sunflower oil.",
              priceCents: 175,
              photoUrl: null,
            },
          ],
        },
        {
          id: "pcat_3",
          name: "Shakes & Drinks",
          dishes: [
            {
              id: "pdish_5",
              name: "Shake",
              description: "Hand-spun with real ice cream. Vanilla, chocolate or strawberry.",
              priceCents: 325,
              photoUrl: null,
            },
            {
              id: "pdish_6",
              name: "Fountain Drink",
              description: "Coca-Cola products, free refills in-store.",
              priceCents: 219,
              photoUrl: null,
            },
          ],
        },
      ],
    },
  },
  {
    id: "rest_1",
    slug: "olive-grove",
    name: "Olive Grove",
    tagline: "Mediterranean small plates & wood-fired mains",
    currency: "USD",
    menu: {
      id: "menu_1",
      name: "Dinner",
      categories: [
        {
          id: "cat_1",
          name: "Starters",
          dishes: [
            {
              id: "dish_1",
              name: "Whipped Feta",
              description: "Feta, honey, chili crisp, warm pita.",
              priceCents: 1100,
              photoUrl:
                "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=640&q=70",
            },
            {
              id: "dish_2",
              name: "Charred Octopus",
              description: "Smoked paprika, fingerling potatoes, lemon.",
              priceCents: 1800,
              photoUrl:
                "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=640&q=70",
            },
          ],
        },
        {
          id: "cat_2",
          name: "Mains",
          dishes: [
            {
              id: "dish_3",
              name: "Wood-Fired Branzino",
              description: "Whole grilled sea bass, salsa verde, greens.",
              priceCents: 3200,
              photoUrl:
                "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=640&q=70",
            },
            {
              id: "dish_4",
              name: "Lamb Ragu Pappardelle",
              description: "Slow-braised lamb, pecorino, mint.",
              priceCents: 2600,
              photoUrl:
                "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=640&q=70",
            },
          ],
        },
        {
          id: "cat_3",
          name: "Dessert",
          dishes: [
            {
              id: "dish_5",
              name: "Baklava Cheesecake",
              description: "Pistachio, phyllo, orange-blossom honey.",
              priceCents: 1200,
              photoUrl: null,
            },
          ],
        },
      ],
    },
  },
  {
    id: "rest_2",
    slug: "burger-bunker",
    name: "Burger Bunker",
    tagline: "Smash burgers, crinkle fries, thick shakes",
    currency: "USD",
    menu: {
      id: "menu_2",
      name: "All Day",
      categories: [
        {
          id: "cat_4",
          name: "Burgers",
          dishes: [
            {
              id: "dish_6",
              name: "The Classic Smash",
              description: "Double patty, American cheese, house sauce.",
              priceCents: 1000,
              photoUrl:
                "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=640&q=70",
            },
            {
              id: "dish_7",
              name: "Bunker Bacon",
              description: "Triple patty, smoked bacon, crispy onions.",
              priceCents: 1400,
              photoUrl:
                "https://images.unsplash.com/photo-1550547660-d9450f859349?w=640&q=70",
            },
          ],
        },
        {
          id: "cat_5",
          name: "Sides & Shakes",
          dishes: [
            {
              id: "dish_8",
              name: "Crinkle Fries",
              description: "Sea salt, malt-vinegar aioli.",
              priceCents: 500,
              photoUrl: null,
            },
            {
              id: "dish_9",
              name: "Vanilla Malt Shake",
              description: "Hand-spun, real malt, whipped cream.",
              priceCents: 700,
              photoUrl: null,
            },
          ],
        },
      ],
    },
  },
];

export function getAllRestaurants(): Restaurant[] {
  return RESTAURANTS;
}

export function getRestaurantBySlug(slug: string): Restaurant | undefined {
  return RESTAURANTS.find((r) => r.slug === slug);
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
