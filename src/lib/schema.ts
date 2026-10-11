/**
 * schema.org JSON-LD builders. Structured data helps Google understand the
 * site (organization, games, apps, breadcrumbs) and can unlock rich results.
 */
import { SITE } from '../config/site';
import { CATEGORIES } from '../config/categories';
import { absoluteUrl, audienceOf, gameUrl, type App, type Game } from './content';

const CONTEXT = 'https://schema.org';
const ORG_ID = `${SITE.url}/#organization`;

const sameAs = () =>
  [SITE.appStoreDeveloperUrl, SITE.googlePlayDeveloperUrl, ...Object.values(SITE.social)].filter(Boolean);

export const organization = () => ({
  '@context': CONTEXT,
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE.name,
  url: SITE.url,
  logo: absoluteUrl('/apple-touch-icon.png'),
  description: SITE.studioTagline,
  email: SITE.email,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SITE.email,
    url: absoluteUrl('/about#contact'),
  },
  ...(SITE.foundingYear ? { foundingDate: String(SITE.foundingYear) } : {}),
  sameAs: sameAs(),
});

export const website = () => ({
  '@context': CONTEXT,
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  publisher: { '@id': ORG_ID },
});

export const breadcrumbs = (items: { label: string; href: string }[]) => ({
  '@context': CONTEXT,
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.label,
    item: absoluteUrl(item.href),
  })),
});

export const gameList = (games: Game[]) => ({
  '@context': CONTEXT,
  '@type': 'ItemList',
  itemListElement: games.map((game, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: absoluteUrl(gameUrl(game)),
    name: game.data.title,
  })),
});

// Each game is both a game and a learning resource, so search engines can match it to
// searches like "gear ratio activity for year 9".
export const videoGame = (game: Game, imageUrl: string) => {
  const { title, description, category, publishedAt, updatedAt, appStoreUrl, googlePlayUrl, years, learn } = game.data;
  const who = audienceOf(years);
  return {
    '@context': CONTEXT,
    '@type': ['VideoGame', 'LearningResource'],
    name: title,
    description,
    url: absoluteUrl(gameUrl(game)),
    image: imageUrl,
    genre: ['Educational', CATEGORIES[category].label],
    learningResourceType: 'Educational game',
    about: CATEGORIES[category].heading.replace(/ games$/, ''),
    ...(learn.length ? { teaches: learn } : {}),
    ...(who ? { educationalLevel: `${who.years} (UK), ${who.grades} (US)`, typicalAgeRange: who.ageRange } : {}),
    audience: { '@type': 'EducationalAudience', educationalRole: 'student' },
    gamePlatform: ['Web browser', appStoreUrl && 'iOS', googlePlayUrl && 'Android'].filter(Boolean),
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    datePublished: publishedAt.toISOString().slice(0, 10),
    ...(updatedAt ? { dateModified: updatedAt.toISOString().slice(0, 10) } : {}),
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': ORG_ID },
    author: { '@id': ORG_ID },
  };
};

export const mobileAppList = (apps: App[]) => ({
  '@context': CONTEXT,
  '@type': 'ItemList',
  name: `${SITE.name} mobile apps`,
  itemListElement: apps.map((app, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'MobileApplication',
      name: app.data.name,
      description: app.data.summary,
      applicationCategory: 'GameApplication',
      operatingSystem: [app.data.appStoreUrl && 'iOS', app.data.googlePlayUrl && 'Android'].filter(Boolean).join(', '),
      ...(app.data.appStoreUrl || app.data.googlePlayUrl
        ? { installUrl: app.data.appStoreUrl ?? app.data.googlePlayUrl }
        : {}),
      author: { '@id': ORG_ID },
    },
  })),
});

// Questions and answers shown on the page (answers as plain text)
export const faqPage = (items: { q: string; a: string }[]) => ({
  '@context': CONTEXT,
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
});
