/**
 * Global site settings — edit this file first.
 * Everything SEO-related (canonical URLs, sitemap, Open Graph, structured data)
 * is generated from these values.
 */
export const SITE = {
  name: 'DowPlay',
  // TODO: your real production domain (no trailing slash). Used for canonical URLs and the sitemap.
  url: 'https://dowplay.com',
  locale: 'en',
  ogLocale: 'en_US',

  // Home page <title> and meta description
  title: 'DowPlay — Free Online HTML5 Games',
  description:
    'Play free HTML5 games online from DowPlay. No downloads, no sign-up — instant browser games that work on mobile, tablet and desktop.',

  // Used on /about and in structured data
  studioTagline: 'Independent game studio making mobile and web games.',
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

export const NAV = [
  { href: '/', label: 'Games' },
  { href: '/about', label: 'About' },
  { href: '/about#contact', label: 'Contact' },
] as const;
