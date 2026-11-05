/**
 * EXAMPLE: the same app rebranded as a coffee shop in Kampala.
 *
 * To use it for a fresh deploy:
 *   copy  business/examples/coffee-shop/business.config.ts  ->  business/business.config.ts
 *   copy  business/examples/coffee-shop/data.json           ->  business/seed/data.json
 *   (then fix the import path at the top: "./src/schema")
 * See REBRANDING.md for the full checklist.
 */
import type { BusinessConfig } from "../../src/schema";

export const businessConfig: BusinessConfig = {
  settings: {
    name: "Ember Coffee",
    tagline: "roasted in kampala",
    logoUrl: "",
    faviconUrl: "",
    heroImageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=80",
    colors: {
      primary: "#2f5d50", // deep green
      accent: "#d9a441", // golden crema
      ink: "#1f2a27",
      background: "#f4f1ea",
      surface: "#fffdf8",
    },
    contact: {
      email: "hello@embercoffee.example",
      phone: "+256 700 000 000",
      whatsapp: "+256 700 000 000",
      address: "Plot 12, Kampala Road, Kampala",
      city: "Kampala",
      mapUrl: "",
    },
    socials: { instagram: "https://instagram.com/embercoffee.example", facebook: "", x: "", tiktok: "", website: "" },
    hours: [
      { label: "Mon–Fri", value: "6:30 – 19:00" },
      { label: "Sat–Sun", value: "8:00 – 17:00" },
    ],
    currency: { code: "UGX", locale: "en-UG" },
    categories: ["Espresso", "Filter", "Cold drinks", "Beans", "Snacks"],
    seo: {
      title: "Ember Coffee — specialty coffee in Kampala",
      description: "Single-origin Ugandan coffee, roasted in small batches and served fresh in central Kampala.",
    },
    checkout: {
      methods: { cod: true, flutterwave: false, pesapal: true },
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
      pickup: { enabled: true, address: "Plot 12, Kampala Road, Kampala", note: "Ready in about 10 minutes." },
      minOrder: 0,
    },
  },
  copy: {
    topBanner: "Freshly roasted every Tuesday · order ahead and skip the queue",
    nav: { products: "Menu", story: "Our beans", visit: "Visit", staff: "Staff" },
    hero: {
      eyebrow: "Good morning, Kampala",
      cta: "See the menu",
      nextUp: "Next roast: Tuesday",
      badge: "Roasted this week",
      note: "freshly pulled",
      noteLabel: "Barista says",
      imageAlt: "A cup of coffee on a wooden table",
    },
    products: {
      eyebrow: "On the bar today",
      title: "The menu",
      searchPlaceholder: "Latte, cold brew, beans...",
      countSuffix: "drinks & more",
      addedToCart: "added to your order",
      empty: "Nothing on the menu matches that",
    },
    story: {
      eyebrow: "Where it comes from",
      title: "Coffee from the",
      highlight: "slopes of Mount Elgon.",
      points: [
        { title: "Direct trade", body: "We buy straight from farmer groups we visit." },
        { title: "Small batches", body: "Roasted weekly so every cup tastes alive." },
      ],
    },
    reviews: { eyebrow: "Overheard at the bar", title: "Regulars say", verified: "Regular" },
    visit: {
      eyebrow: "Pull up a chair",
      title: "Come for the coffee, stay for the wifi.",
      body: "Order ahead for pickup, or sit in with us.",
      cardLabel: "Opening hours",
      cardText: "The first shot is pulled at 6:30.",
    },
    newsletter: {
      eyebrow: "The roast report",
      title: "New beans, first dibs.",
      body: "A short email when a new single-origin lands.",
      button: "Subscribe",
      done: "You're subscribed",
    },
    cart: {
      eyebrow: "Your order",
      title: "Nice picks.",
      emptyTitle: "Your order is empty.",
      emptyBody: "Add a drink or a bag of beans to get started.",
      footnote: "Pay at pickup · totals confirmed by the shop",
      checkout: "Continue",
    },
    checkout: {
      eyebrow: "Almost done",
      title: "Who's this order for?",
      notePlaceholder: "Oat milk, extra hot, pickup time...",
      placeOrder: "Send my order",
      success: "Order sent — see you soon!",
    },
    footer: { line: "Roasted and brewed in Kampala, Uganda", signoff: "brewed with care" },
    admin: { title: "Coffee bar" },
  },
  statusLabels: {
    Pending: "New",
    Confirmed: "Accepted",
    Preparing: "Brewing",
    "Ready for Pickup": "Ready at the counter",
    "Out for Delivery": "On the way",
    Completed: "Collected",
    Cancelled: "Cancelled",
  },
  fonts: {
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&family=JetBrains+Mono:wght@400;700&display=swap",
    sans: "'Inter', system-ui, sans-serif",
    serif: "'Playfair Display', Georgia, serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
};

export default businessConfig;
