import axios from 'axios';

const MUSICBRAINZ_API_URL = 'https://musicbrainz.org/ws/2';
const DEFAULT_USER_AGENT = 'DiscogsManager/1.0 (personal local CD catalog)';

type MusicBrainzRequest = typeof axios.get;

type MusicBrainzArtistResponse = {
  artists?: Array<{ id?: string; name?: string; 'sort-name'?: string; disambiguation?: string; type?: string; country?: string; score?: number | string; 'life-span'?: { begin?: string; end?: string; ended?: boolean } }>;
};

type MusicBrainzReleaseGroupResponse = {
  'release-groups'?: Array<{ id?: string; title?: string; 'primary-type'?: string; 'secondary-types'?: string[]; 'first-release-date'?: string; score?: number | string; 'release-count'?: number; 'artist-credit'?: Array<{ name?: string; joinphrase?: string; artist?: { id?: string; name?: string } }> }>;
};

export type MusicBrainzArtistResult = {
  id: string;
  name: string;
  sortName: string | null;
  disambiguation: string | null;
  type: string | null;
  country: string | null;
  score: number | null;
  beginDate: string | null;
  endDate: string | null;
  ended: boolean | null;
};

export type MusicBrainzArtistCredit = { id: string | null; name: string; joinPhrase: string | null };

export type MusicBrainzReleaseGroupResult = {
  id: string;
  title: string;
  primaryType: string | null;
  secondaryTypes: string[];
  firstReleaseDate: string | null;
  score: number | null;
  releaseCount: number | null;
  artistCredits: MusicBrainzArtistCredit[];
};

export type MusicBrainzSearchResults = { artists: MusicBrainzArtistResult[]; releaseGroups: MusicBrainzReleaseGroupResult[] };
export type MusicBrainzSearchCriteria = { artist?: string; album?: string };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeLuceneValue(value: string): string {
  return value.replace(/([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)/gu, '\\$1');
}

function musicBrainzSearchQuery(artist: string, album: string): string {
  return [artist ? `artist:"${escapeLuceneValue(artist)}"` : '', album ? `releasegroup:"${escapeLuceneValue(album)}"` : ''].filter(Boolean).join(' AND ');
}

function normalizeArtistResult(artist: NonNullable<MusicBrainzArtistResponse['artists']>[number]): MusicBrainzArtistResult | null {
  const id = nullableText(artist.id);
  const name = nullableText(artist.name);
  if (!id || !name) return null;
  return {
    id, name,
    sortName: nullableText(artist['sort-name']), disambiguation: nullableText(artist.disambiguation), type: nullableText(artist.type), country: nullableText(artist.country), score: nullableNumber(artist.score),
    beginDate: nullableText(artist['life-span']?.begin), endDate: nullableText(artist['life-span']?.end), ended: typeof artist['life-span']?.ended === 'boolean' ? artist['life-span'].ended : null,
  };
}

function normalizeReleaseGroupResult(releaseGroup: NonNullable<MusicBrainzReleaseGroupResponse['release-groups']>[number]): MusicBrainzReleaseGroupResult | null {
  const id = nullableText(releaseGroup.id);
  const title = nullableText(releaseGroup.title);
  if (!id || !title) return null;
  return {
    id, title, primaryType: nullableText(releaseGroup['primary-type']), secondaryTypes: (releaseGroup['secondary-types'] ?? []).flatMap((type) => nullableText(type) ?? []),
    firstReleaseDate: nullableText(releaseGroup['first-release-date']), score: nullableNumber(releaseGroup.score), releaseCount: nullableNumber(releaseGroup['release-count']),
    artistCredits: (releaseGroup['artist-credit'] ?? []).flatMap((credit) => {
      const name = nullableText(credit.name) ?? nullableText(credit.artist?.name);
      return name ? [{ id: nullableText(credit.artist?.id), name, joinPhrase: nullableText(credit.joinphrase) }] : [];
    }),
  };
}

/** MusicBrainz asks clients to stay at or below one request per second. */
export class MusicBrainzClient {
  private nextRequestAt = 0;

  constructor(
    private readonly request: MusicBrainzRequest = axios.get,
    private readonly minimumRequestIntervalMs = 1_000,
    private readonly userAgent = process.env.MUSICBRAINZ_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
  ) {}

  async search(criteria: MusicBrainzSearchCriteria): Promise<MusicBrainzSearchResults> {
    const artist = criteria.artist?.trim() || '';
    const album = criteria.album?.trim() || '';
    if (!artist && !album) return { artists: [], releaseGroups: [] };
    const artists = artist ? await this.searchArtists(artist) : [];
    const releaseGroups = album ? await this.searchReleaseGroups(artist, album) : [];
    return { artists, releaseGroups };
  }

  private async searchArtists(query: string): Promise<MusicBrainzArtistResult[]> {
    const response = await this.get<MusicBrainzArtistResponse>('/artist', { query, limit: 10 });
    return (response.data.artists ?? []).flatMap((artist) => normalizeArtistResult(artist) ?? []);
  }

  private async searchReleaseGroups(artist: string, album: string): Promise<MusicBrainzReleaseGroupResult[]> {
    const response = await this.get<MusicBrainzReleaseGroupResponse>('/release-group', { query: musicBrainzSearchQuery(artist, album), limit: 10 });
    return (response.data['release-groups'] ?? []).flatMap((releaseGroup) => normalizeReleaseGroupResult(releaseGroup) ?? []);
  }

  private async get<T>(path: string, params: Record<string, string | number>) {
    const scheduledAt = Math.max(Date.now(), this.nextRequestAt);
    this.nextRequestAt = scheduledAt + this.minimumRequestIntervalMs;
    await delay(scheduledAt - Date.now());
    return this.request<T>(`${MUSICBRAINZ_API_URL}${path}`, { params: { ...params, fmt: 'json' }, headers: { Accept: 'application/json', 'User-Agent': this.userAgent }, timeout: 8_000 });
  }
}

const musicBrainzClient = new MusicBrainzClient();
export function searchMusicBrainz(criteria: MusicBrainzSearchCriteria): Promise<MusicBrainzSearchResults> {
  return musicBrainzClient.search(criteria);
}
