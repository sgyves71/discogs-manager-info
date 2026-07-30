import axios from 'axios';

// Discogs allows 60 authenticated requests per minute. Keep a small buffer so
// every Discogs endpoint can share this scheduler without approaching the cap.
const MIN_REQUEST_INTERVAL_MS = 1_100;
let nextDiscogsRequestAt = 0;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDiscogsSlot(): Promise<void> {
  const scheduledAt = Math.max(Date.now(), nextDiscogsRequestAt);
  nextDiscogsRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS;
  await delay(scheduledAt - Date.now());
}

function retryDelayMilliseconds(error: unknown, attempt: number): number {
  if (axios.isAxiosError(error)) {
    const retryAfter = Number(error.response?.headers?.['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1_000;
    }
  }

  return 1_000 * (2 ** attempt);
}

async function requestDiscogs<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    await waitForDiscogsSlot();

    try {
      return await request();
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status !== 429 || attempt >= 2) {
        throw error;
      }

      await delay(retryDelayMilliseconds(error, attempt));
    }
  }
}

export type DiscogsSearchResult = {
  id: number;
  title?: string | null;
  artist?: string | null;
  year?: string | number | null;
  country?: unknown;
  label?: unknown;
  format?: unknown;
  uri?: string | null;
  thumb?: string | null;
  cover_image?: string | null;
  lowest_price?: string | number | null;
  formats?: unknown;
  catno?: unknown;
  barcode?: unknown;
  resource_url?: string | null;
};

export type NormalizedDiscogsResult = {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  country: string | null;
  label: string | null;
  format: string;
  uri: string;
  thumb: string | null;
  coverImage: string | null;
  catalogNumber: string | null;
  barcode: string | null;
  lowestPrice: number | null;
};

type DiscogsReleaseDetails = {
  images?: Array<{
    uri150?: string | null;
    uri?: string | null;
  }>;
  labels?: Array<{
    name?: string | null;
    catno?: string | null;
  }>;
  identifiers?: Array<{
    type?: string | null;
    value?: string | null;
  }>;
  notes?: string | null;
  genres?: string[] | null;
  styles?: string[] | null;
  artists?: Array<{
    id?: number | null;
    name?: string | null;
  }>;
  master_id?: number | null;
  tracklist?: DiscogsTrack[];
};

type DiscogsTrack = {
  position?: string | null;
  title?: string | null;
  duration?: string | null;
  type_?: string | null;
  sub_tracks?: DiscogsTrack[];
};

type DiscogsMasterDetails = {
  notes?: string | null;
};

type DiscogsArtistDetails = {
  profile?: string | null;
};

export type DiscogsReleaseContext = {
  description: string | null;
  descriptionSource: 'release' | 'album' | 'artist' | null;
  artistProfile: string | null;
  genre: string | null;
  style: string | null;
};

export type DiscogsReleaseImage = {
  url: string;
  thumbnailUrl: string;
};

export type DiscogsReleaseTrack = {
  position: string | null;
  title: string;
  duration: string | null;
};

export type DiscogsReleaseCatalogInfo = {
  label: string | null;
  catalogNumber: string | null;
  barcode: string | null;
};

type DiscogsPriceSuggestion = {
  value?: number | string | null;
  currency?: string | null;
};

export type DiscogsPriceSuggestionResult = {
  condition: string;
  value: number;
  currency: string | null;
};

// Discogs appends numeric suffixes to distinguish artists with the same name
// (for example, "Obsession (6)"). They are identifiers, not part of the
// artist's display or search name.
export function cleanDiscogsText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[–—]/gu, '-')
    .replace(/[^\p{Script=Latin}\p{N}\s&'’.,!?()[\]{}\-/:;+=$%#@]/gu, '')
    .replace(/\s*=+\s*$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function stripDiscogsArtistDisambiguator(value: string): string {
  return cleanDiscogsText(value).replace(/\s*\(\d+\)\s*$/u, '').trim();
}

export async function searchDiscogsReleases(
  query: string,
  token?: string,
  requestFn: typeof axios.get = axios.get,
  artist?: string,
  releaseTitle?: string,
  catalogNumber?: string,
  barcode?: string,
): Promise<NormalizedDiscogsResult[]> {
  if (!query.trim() && !artist?.trim() && !releaseTitle?.trim() && !catalogNumber?.trim() && !barcode?.trim()) {
    return [];
  }

  try {
    const response = await requestDiscogs(() => requestFn('https://api.discogs.com/database/search', {
      params: {
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(artist?.trim() ? { artist: stripDiscogsArtistDisambiguator(artist) } : {}),
        ...(releaseTitle?.trim() ? { release_title: releaseTitle.trim() } : {}),
        ...(catalogNumber?.trim() ? { catno: catalogNumber.trim() } : {}),
        ...(barcode?.trim() ? { barcode: barcode.trim() } : {}),
        type: 'release',
        format: 'CD',
        per_page: 100,
      },
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6000,
    }));

    const results = Array.isArray(response.data?.results) ? response.data.results : [];
    return results.map((result: DiscogsSearchResult) => normalizeDiscogsResult(result));
  } catch (error) {
    console.error('Discogs search failed:', error);
    return [];
  }
}

export async function getDiscogsReleaseCover(
  releaseId: number,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<string | null> {
  const response = await requestDiscogs(() => requestFn<DiscogsReleaseDetails>(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6000,
    },
  ));

  const image = response.data?.images?.[0];
  return image?.uri150?.trim() || image?.uri?.trim() || null;
}

export async function getDiscogsReleaseCatalogInfo(
  releaseId: number,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<DiscogsReleaseCatalogInfo> {
  const response = await requestDiscogs(() => requestFn<DiscogsReleaseDetails>(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6_000,
    },
  ));
  const labels = response.data?.labels ?? [];
  const labelNames = [...new Set(labels.map((label) => label.name?.trim()).filter((value): value is string => Boolean(value)))];
  const catalogNumbers = [...new Set(labels.map((label) => label.catno?.trim()).filter((value): value is string => Boolean(value)))];
  const barcodeIdentifiers = response.data?.identifiers ?? [];
  const barcodeParts = ['Barcode (Text)', 'Barcode (Scanned)']
    .map((type) => {
      const values = [...new Set(barcodeIdentifiers
        .filter((identifier) => identifier.type?.trim() === type)
        .map((identifier) => identifier.value?.trim())
        .filter((value): value is string => Boolean(value)))];
      return values.length ? `${type.replace('Barcode ', '')}: ${values.join(', ')}` : null;
    })
    .filter((value): value is string => Boolean(value));
  return {
    label: labelNames.length ? labelNames.join(', ') : null,
    catalogNumber: catalogNumbers.length ? catalogNumbers.join(', ') : null,
    barcode: barcodeParts.length ? barcodeParts.join(' · ') : null,
  };
}

export async function getDiscogsReleaseImages(
  releaseId: number,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<DiscogsReleaseImage[]> {
  const response = await requestDiscogs(() => requestFn<DiscogsReleaseDetails>(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6_000,
    },
  ));

  const seen = new Set<string>();
  return (response.data?.images ?? []).flatMap((image) => {
    const url = image.uri?.trim();
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ url, thumbnailUrl: image.uri150?.trim() || url }];
  });
}

export async function getDiscogsReleaseTracklist(
  releaseId: number,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<DiscogsReleaseTrack[]> {
  const response = await requestDiscogs(() => requestFn<DiscogsReleaseDetails>(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6_000,
    },
  ));

  const flattenTracks = (tracks: DiscogsTrack[]): DiscogsTrack[] => tracks.flatMap((track) => [
    track,
    ...(Array.isArray(track.sub_tracks) ? flattenTracks(track.sub_tracks) : []),
  ]);
  return flattenTracks(response.data?.tracklist ?? [])
    .filter((track) => track.type_ !== 'heading' && Boolean(track.title?.trim()))
    .map((track) => ({
      position: track.position?.trim() || null,
      title: track.title!.trim(),
      duration: track.duration?.trim() || null,
    }));
}

export async function getDiscogsReleaseContext(
  releaseId: number,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<DiscogsReleaseContext> {
  const releaseResponse = await requestDiscogs(() => requestFn<DiscogsReleaseDetails>(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6_000,
    },
  ));

  const artistId = releaseResponse.data?.artists?.[0]?.id;
  let description = releaseResponse.data?.notes?.trim() || null;
  let descriptionSource: DiscogsReleaseContext['descriptionSource'] = description ? 'release' : null;

  const masterId = releaseResponse.data?.master_id;
  if (!description && typeof masterId === 'number' && masterId > 0) {
    const masterResponse = await requestDiscogs(() => requestFn<DiscogsMasterDetails>(
      `https://api.discogs.com/masters/${masterId}`,
      {
        headers: {
          ...(token ? { Authorization: `Discogs token=${token}` } : {}),
          'User-Agent': 'DiscogsManager/0.1 +http://localhost',
        },
        timeout: 6_000,
      },
    ));
    description = masterResponse.data?.notes?.trim() || null;
    descriptionSource = description ? 'album' : null;
  }

  let artistProfile: string | null = null;
  if (typeof artistId === 'number' && artistId > 0) {
    const artistResponse = await requestDiscogs(() => requestFn<DiscogsArtistDetails>(
      `https://api.discogs.com/artists/${artistId}`,
      {
        headers: {
          ...(token ? { Authorization: `Discogs token=${token}` } : {}),
          'User-Agent': 'DiscogsManager/0.1 +http://localhost',
        },
        timeout: 6_000,
      },
    ));
    artistProfile = artistResponse.data?.profile?.trim() || null;
  }

  if (!description && artistProfile) {
    description = artistProfile;
    descriptionSource = 'artist';
  }

  return {
    description,
    descriptionSource,
    artistProfile,
    genre: releaseResponse.data?.genres?.map((genre) => genre.trim()).filter(Boolean).join(', ') || null,
    style: releaseResponse.data?.styles?.map((style) => style.trim()).filter(Boolean).join(', ') || null,
  };
}

export async function getDiscogsPriceSuggestion(
  releaseId: number,
  condition: string,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<{ value: number; currency: string | null } | null> {
  const suggestions = await getDiscogsPriceSuggestions(releaseId, token, requestFn);
  const suggestion = suggestions.find((entry) => entry.condition === condition);
  return suggestion ? { value: suggestion.value, currency: suggestion.currency } : null;
}

export async function getDiscogsPriceSuggestions(
  releaseId: number,
  token?: string,
  requestFn: typeof axios.get = axios.get,
): Promise<DiscogsPriceSuggestionResult[]> {
  const response = await requestDiscogs(() => requestFn<Record<string, DiscogsPriceSuggestion>>(
    `https://api.discogs.com/marketplace/price_suggestions/${releaseId}`,
    {
      headers: {
        ...(token ? { Authorization: `Discogs token=${token}` } : {}),
        'User-Agent': 'DiscogsManager/0.1 +http://localhost',
      },
      timeout: 6000,
    },
  ));

  return Object.entries(response.data ?? {}).flatMap(([condition, suggestion]) => {
    const value = Number(suggestion?.value);
    if (!Number.isFinite(value) || value <= 0) {
      return [];
    }

    return [{ condition, value, currency: suggestion?.currency?.trim() || null }];
  });
}

function normalizeStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => normalizeStringValue(item))
      .filter((item): item is string => Boolean(item))
      .join(', ');

    return joined || null;
  }

  if (value && typeof value === 'object') {
    const maybeName = (value as { name?: unknown }).name;
    const maybeTitle = (value as { title?: unknown }).title;
    if (typeof maybeName === 'string') {
      return maybeName.trim() || null;
    }
    if (typeof maybeTitle === 'string') {
      return maybeTitle.trim() || null;
    }
  }

  return null;
}

export function normalizeDiscogsResult(result: DiscogsSearchResult): NormalizedDiscogsResult {
  const rawTitle = normalizeStringValue(result.title) ?? 'Untitled release';
  // Discogs database-search results identify releases as "Artist - Title" and
  // do not include a separate artist field. Preserve any explicit artist field,
  // but derive it from that combined title when necessary.
  const separatorIndex = rawTitle.indexOf(' - ');
  const inferredArtist = separatorIndex > 0 ? rawTitle.slice(0, separatorIndex).trim() : null;
  const title = cleanDiscogsText(separatorIndex >= 0 ? rawTitle.slice(separatorIndex + 3).trim() : rawTitle.trim()) || 'Untitled release';
  const artist = stripDiscogsArtistDisambiguator(normalizeStringValue(result.artist) ?? inferredArtist ?? 'Unknown artist');
  const year = typeof result.year === 'number' ? result.year : Number(result.year ?? '0');
  const normalizedYear = Number.isFinite(year) && year > 0 ? year : null;
  const formatValue = normalizeStringValue(result.format) ?? normalizeStringValue(result.formats);

  return {
    id: result.id,
    title,
    artist,
    year: normalizedYear,
    country: normalizeStringValue(result.country),
    label: (() => {
      const label = normalizeStringValue(result.label);
      return label ? cleanDiscogsText(label) || null : null;
    })(),
    format: formatValue ?? '',
    uri: result.uri?.trim() || result.resource_url?.trim() || '',
    thumb: result.thumb?.trim() || null,
    coverImage: result.cover_image?.trim() || null,
    catalogNumber: normalizeStringValue(result.catno),
    barcode: normalizeStringValue(result.barcode),
    lowestPrice: parseFloat(String(result.lowest_price ?? 'NaN')) || null,
  };
}
