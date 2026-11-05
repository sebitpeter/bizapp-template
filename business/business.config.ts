/**
 * ============================================================================
 *  BUSINESS CONFIG — the one file to edit when you reuse this app for a new
 *  business. See REBRANDING.md in the repo root for a step-by-step guide.
 * ============================================================================
 *
 *  - `settings` are DEFAULTS. Once the app is running, an admin can change all
 *    of them in the browser (Admin → Branding) without touching code; saved
 *    changes live in the database and win over these defaults.
 *  - `copy`, `statusLabels` and `fonts` are build-time only: edit, then rebuild.
 *  - Products, reviews and starter copy blocks live in ./seed/data.json.
 *
 *  Example config for another business: ./examples/coffee-shop
 */
import type { BusinessConfig } from "./src/schema";

export const businessConfig: BusinessConfig = {
  settings: {
    name: "Bake&Bite",
    tagline: "slow food / good mood",
    logoUrl: "", // empty = show a monogram built from the name
    faviconUrl: "", // empty = generated favicon (first letter + primary colour)
    heroImageUrl: "/hero.png",
    colors: {
      primary: "#8d304d",
      accent: "#f2a263",
      ink: "#4c202f",
      background: "#f7f0e4",
      surface: "#fff7e8",
    },
    contact: {
      email: "hello@example.com",
      phone: "+256 700 000 000",
      whatsapp: "",
      address: "Plot 4, Kampala Road, Kampala",
      city: "Kampala",
      mapUrl: "",
    },
    socials: { instagram: "", facebook: "", x: "", tiktok: "", website: "" },
    hours: [
      { label: "Tue–Sun", value: "7:00 – 15:00" },
      { label: "Mon", value: "Closed" },
    ],
    currency: { code: "UGX", locale: "en-UG" },
    categories: ["Breads", "Pastries", "Cakes", "Cookies", "Savory"],
    seo: {
      title: "Bake&Bite Bakery — fresh bread & pastries in Kampala",
      description: "Small-batch breads, golden pastries and celebration cakes, baked every morning and delivered across Kampala.",
    },
    checkout: {
      methods: { cod: true, flutterwave: true, pesapal: false },
      phoneCountryCode: "256",
      delivery: {
        enabled: true,
        zones: [
          { id: "central", name: "Kampala Central", fee: 5000 },
          { id: "nakawa", name: "Nakawa / Ntinda", fee: 7000 },
          { id: "entebbe", name: "Entebbe Road", fee: 12000 },
        ],
        freeOver: 150000,
        note: "Same-day delivery for orders before 2 pm.",
      },
      pickup: { enabled: true, address: "Plot 4, Kampala Road, Kampala", note: "Ready in about 30 minutes." },
      minOrder: 0,
    },
  },

  copy: {
    topBanner: "Baked fresh every morning · local delivery available",
    nav: { products: "Today's bakes", story: "Our story", visit: "Find us", staff: "Staff portal" },
    hero: {
      eyebrow: "Good morning, neighbor",
      cta: "Shop the bakes",
      nextUp: "Next bake: 6:30 AM tomorrow",
      badge: "Baked today",
      note: "still warm",
      noteLabel: "Today's note",
      imageAlt: "Fresh bread and pastries on a counter",
    },
    products: {
      eyebrow: "The counter is open",
      title: "Today's bakes",
      searchPlaceholder: "Find your next favorite...",
      countSuffix: "fresh picks",
      addedToCart: "joined your basket",
      empty: "No bakes match that search",
    },
    story: {
      eyebrow: "A little about us",
      title: "Bread for the",
      highlight: "long way home.",
      points: [
        { title: "Long fermentation", body: "Time is our most important ingredient." },
        { title: "Close to home", body: "Flour, fruit, and stories from nearby." },
      ],
    },
    reviews: { eyebrow: "Notes from the table", title: "People who bite back", verified: "Verified customer" },
    visit: {
      eyebrow: "Come say hello",
      title: "Find the warm light.",
      body: "Local delivery available.",
      cardLabel: "Kitchen hours",
      cardText: "The first loaf comes out before the sun.",
    },
    newsletter: {
      eyebrow: "A note from the oven",
      title: "Get the good stuff first.",
      body: "One short email when the weekend specials land. No crumbs in your inbox.",
      button: "Sign me up",
      done: "You're on the list",
    },
    cart: {
      eyebrow: "Your basket",
      title: "Good choices.",
      emptyTitle: "Your basket is resting.",
      emptyBody: "Add something warm and we'll keep it safe here.",
      footnote: "Payment at the door · totals confirmed by the shop",
      checkout: "Continue to checkout",
    },
    checkout: {
      eyebrow: "One last thing",
      title: "Where should we bring it?",
      notePlaceholder: "Gate code, porch preference, kind words...",
      placeOrder: "Place the order",
      success: "Order received — thank you!",
    },
    footer: { line: "Freshly made in Kampala, South Sudan", signoff: "made with patience" },
    admin: { title: "Staff kitchen" },
  },

  statusLabels: {
    Pending: "Pending",
    Confirmed: "Confirmed",
    Preparing: "Baking",
    "Ready for Pickup": "Ready for pickup",
    "Out for Delivery": "Out for delivery",
    Completed: "Completed",
    Cancelled: "Cancelled",
  },

  fonts: {
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Space+Mono:wght@400;700&display=swap",
    sans: "'DM Sans', system-ui, sans-serif",
    serif: "'Fraunces', Georgia, serif",
    mono: "'Space Mono', ui-monospace, monospace",
  },
};

export default businessConfig;
