import axios from 'axios';

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_MARKETPLACE_INSIGHTS_SEARCH_URL = 'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search';
const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const EBAY_MUSIC_CD_CATEGORY_ID = '176984';

type EBayToken = {
  access_token?: string;
  expires_in?: number;
};

type EBayItemSummary = {
  title?: string;
  price?: {
    value?: string | number;
    currency?: string;
  };
};

type EBaySearchResponse = {
  total?: number;
  itemSummaries?: EBayItemSummary[];
};

type EBaySoldItem = {
  title?: string;
  lastSoldPrice?: {
    value?: string | number;
    currency?: string;
  };
};

type EBayMarketplaceInsightsResponse = {
  total?: number;
  itemSales?: EBaySoldItem[];
};

export type EBayActiveListingStats = {
  listingCount: number;
  sampledListingCount: number;
  lowestPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  currency: string | null;
  searchMethod: 'catalogNumber' | 'artistTitle';
};

export type EBaySoldListingStats = {
  accessStatus: 'available' | 'pending';
  saleCount: number;
  sampledSaleCount: number;
  lowestPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  currency: string | null;
  searchMethod: 'catalogNumber' | 'artistTitle';
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function normalizeListingText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function cleanEbaySearchText(value: string): string {
  return value
    .replace(/\s*\(\d+\)(?=\s*(?:=|$))/gu, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:=|\/|\||-)\s*$/u, '')
    .trim();
}

function isMatchingCdAudioListing(listingTitle: string | undefined, artist: string, albumTitle: string): boolean {
  if (!listingTitle || !/(?:\bcd\b|\bcompact\s+disc\b|\baudio\s+cd\b)/i.test(listingTitle)) {
    return false;
  }

  const normalizedListingTitle = normalizeListingText(listingTitle);
  const normalizedArtist = normalizeListingText(artist);
  const normalizedAlbumTitle = normalizeListingText(albumTitle);
  return Boolean(normalizedArtist && normalizedAlbumTitle)
    && normalizedListingTitle.includes(normalizedArtist)
    && normalizedListingTitle.includes(normalizedAlbumTitle);
}

async function getApplicationAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await axios.post<EBayToken>(
    EBAY_TOKEN_URL,
    `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 8_000,
    },
  );

  const accessToken = response.data.access_token;
  if (!accessToken) {
    throw new Error('eBay did not return an application access token.');
  }

  cachedAccessToken = {
    value: accessToken,
    expiresAt: Date.now() + Math.max(60, response.data.expires_in ?? 7_200) * 1_000,
  };
  return accessToken;
}

export async function getEbayActiveListingStats(
  artist: string,
  title: string,
  catalogNumber: string | undefined,
  clientId: string,
  clientSecret: string,
  marketplaceId = 'EBAY_US',
): Promise<EBayActiveListingStats> {
  const accessToken = await getApplicationAccessToken(clientId, clientSecret);
  const searchArtist = cleanEbaySearchText(artist);
  const searchTitle = cleanEbaySearchText(title);
  const search = async (query: string) => axios.get<EBaySearchResponse>(EBAY_BROWSE_SEARCH_URL, {
    params: { q: query, limit: 50, category_ids: EBAY_MUSIC_CD_CATEGORY_ID },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
    },
    timeout: 8_000,
  });

  const normalizedCatalogNumber = catalogNumber?.trim();
  let searchMethod: EBayActiveListingStats['searchMethod'] = 'artistTitle';
  let matchingItems: EBayItemSummary[];

  if (normalizedCatalogNumber) {
    const catalogResponse = await search(normalizedCatalogNumber);
    matchingItems = (catalogResponse.data.itemSummaries ?? [])
      .filter((item) => isMatchingCdAudioListing(item.title, searchArtist, searchTitle));
    if (matchingItems.length > 0) {
      searchMethod = 'catalogNumber';
    } else {
      const artistTitleResponse = await search([searchArtist, searchTitle].filter(Boolean).join(','));
      matchingItems = (artistTitleResponse.data.itemSummaries ?? [])
        .filter((item) => isMatchingCdAudioListing(item.title, searchArtist, searchTitle));
    }
  } else {
    const artistTitleResponse = await search([searchArtist, searchTitle].filter(Boolean).join(','));
    matchingItems = (artistTitleResponse.data.itemSummaries ?? [])
      .filter((item) => isMatchingCdAudioListing(item.title, searchArtist, searchTitle));
  }

  const prices = matchingItems
    .map((item) => ({ value: Number(item.price?.value), currency: item.price?.currency?.trim() || null }))
    .filter((price) => Number.isFinite(price.value) && price.value > 0);
  const currency = prices[0]?.currency ?? null;
  const matchingCurrencyPrices = prices
    .filter((price) => price.currency === currency)
    .map((price) => price.value);

  return {
    listingCount: matchingItems.length,
    sampledListingCount: matchingCurrencyPrices.length,
    lowestPrice: matchingCurrencyPrices.length ? Math.min(...matchingCurrencyPrices) : null,
    averagePrice: matchingCurrencyPrices.length
      ? matchingCurrencyPrices.reduce((sum, price) => sum + price, 0) / matchingCurrencyPrices.length
      : null,
    highestPrice: matchingCurrencyPrices.length ? Math.max(...matchingCurrencyPrices) : null,
    currency,
    searchMethod,
  };
}

export async function getEbaySoldListingStats(
  artist: string,
  title: string,
  catalogNumber: string | undefined,
  clientId: string,
  clientSecret: string,
  marketplaceId = 'EBAY_US',
): Promise<EBaySoldListingStats> {
  const accessToken = await getApplicationAccessToken(clientId, clientSecret);
  const searchArtist = cleanEbaySearchText(artist);
  const searchTitle = cleanEbaySearchText(title);
  const search = async (query: string) => axios.get<EBayMarketplaceInsightsResponse>(
    EBAY_MARKETPLACE_INSIGHTS_SEARCH_URL,
    {
      params: { q: query, category_ids: EBAY_MUSIC_CD_CATEGORY_ID, limit: 50 },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      },
      timeout: 8_000,
    },
  );

  const normalizedCatalogNumber = catalogNumber?.trim();
  let searchMethod: EBaySoldListingStats['searchMethod'] = 'artistTitle';
  let matchingItems: EBaySoldItem[];

  try {
    if (normalizedCatalogNumber) {
      const catalogResponse = await search(normalizedCatalogNumber);
      matchingItems = (catalogResponse.data.itemSales ?? [])
        .filter((item) => isMatchingCdAudioListing(item.title, searchArtist, searchTitle));
      if (matchingItems.length > 0) {
        searchMethod = 'catalogNumber';
      } else {
        const artistTitleResponse = await search([searchArtist, searchTitle].filter(Boolean).join(','));
        matchingItems = (artistTitleResponse.data.itemSales ?? [])
          .filter((item) => isMatchingCdAudioListing(item.title, searchArtist, searchTitle));
      }
    } else {
      const artistTitleResponse = await search([searchArtist, searchTitle].filter(Boolean).join(','));
      matchingItems = (artistTitleResponse.data.itemSales ?? [])
        .filter((item) => isMatchingCdAudioListing(item.title, searchArtist, searchTitle));
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      return {
        accessStatus: 'pending', saleCount: 0, sampledSaleCount: 0,
        lowestPrice: null, averagePrice: null, highestPrice: null, currency: null, searchMethod,
      };
    }
    throw error;
  }

  const prices = matchingItems
    .map((item) => ({ value: Number(item.lastSoldPrice?.value), currency: item.lastSoldPrice?.currency?.trim() || null }))
    .filter((price) => Number.isFinite(price.value) && price.value > 0);
  const currency = prices[0]?.currency ?? null;
  const matchingCurrencyPrices = prices
    .filter((price) => price.currency === currency)
    .map((price) => price.value);

  return {
    accessStatus: 'available',
    saleCount: matchingItems.length,
    sampledSaleCount: matchingCurrencyPrices.length,
    lowestPrice: matchingCurrencyPrices.length ? Math.min(...matchingCurrencyPrices) : null,
    averagePrice: matchingCurrencyPrices.length
      ? matchingCurrencyPrices.reduce((sum, price) => sum + price, 0) / matchingCurrencyPrices.length
      : null,
    highestPrice: matchingCurrencyPrices.length ? Math.max(...matchingCurrencyPrices) : null,
    currency,
    searchMethod,
  };
}
