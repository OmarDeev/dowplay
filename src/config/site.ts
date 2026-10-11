/**
 * Global site settings — edit this file first.
 * Everything SEO-related (canonical URLs, sitemap, Open Graph, structured data)
 * is generated from these values.
 */
export const SITE = {
  name: 'DowPlay',
  // TODO: your real production domain (no trailing slash). Used for canonical URLs and the sitemap.
  url: 'https://dowplay.com',
  // British English (UK school years, GCSE, A-level); US grades are shown alongside
  locale: 'en-GB',
  ogLocale: 'en_GB',

  // Home page <title> and meta description
  title: 'DowPlay — Free Engineering Games for Ages 12–18',
  description:
    'Free engineering games for ages 12–18: build circuits, gears, bridges and power grids, from Year 8 to Year 13. No sign-up, works in any browser.',

  // Who the games are for, shown across the site
  audience: 'Ages 12–18',

  // Used in the footer and in structured data
  studioTagline: 'Free engineering games for curious minds, made by an independent game studio.',
  // TODO: your contact address
  email: 'omardov2010@gmail.com',

  // Contact form on /about. Create a free form at https://formspree.io and paste its
  // endpoint here, e.g. 'https://formspree.io/f/abcdwxyz'. Messages are then emailed to you.
  // While this is empty, the form opens the visitor's email app pre-filled instead.
  contactFormEndpoint: '',
  foundingYear: undefined as number | undefined,

  // TODO: your developer pages on the stores (leave '' to hide)
  appStoreDeveloperUrl: '',
  googlePlayDeveloperUrl: '',

  // Social profiles — shown in the footer and used as schema.org "sameAs" (leave '' to hide)
  social: {
    x: '',
    youtube: '',
    instagram: '',
    tiktok: '',
    linkedin: '',
    discord: '',
  },

  // Google Search Console HTML-tag verification code (optional — DNS verification via Cloudflare also works)
  googleSiteVerification: '',

  // Google Analytics 4 Measurement ID, e.g. 'G-ABC123XYZ9'
  // (analytics.google.com → Admin → Data streams → your web stream). Leave '' to disable analytics.
  googleAnalyticsId: 'G-39H0BYB9PD',
  // Show a cookie banner and only set analytics cookies after the visitor accepts
  // (Google Consent Mode v2). Keep this on if you have visitors from the EU/UK.
  cookieConsent: true,
} as const;

// Main menu. The header adds a "Topics" menu after Games (built from the topics that have
// games) and a "Free teacher packs" button; Contact lives in the footer and on the About page.
export const NAV = [
  { href: '/', label: 'Games' },
  { href: '/teachers', label: 'Teachers' },
  { href: '/about', label: 'About' },
] as const;
