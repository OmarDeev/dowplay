/**
 * schema.org JSON-LD builders. Structured data helps Google understand the
 * site (organization, games, apps, breadcrumbs) and can unlock rich results.
 */
import { SITE } from '../config/site';
import { CATEGORIES } from '../config/categories';
import { absoluteUrl, gameUrl, type App, type Game } from './content';

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

export const videoGame = (game: Game, imageUrl: string) => {
  const { title, description, category, publishedAt, updatedAt, appStoreUrl, googlePlayUrl } = game.data;
  return {
    '@context': CONTEXT,
    '@type': 'VideoGame',
    name: title,
    description,
    url: absoluteUrl(gameUrl(game)),
    image: imageUrl,
    genre: CATEGORIES[category].label,
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
