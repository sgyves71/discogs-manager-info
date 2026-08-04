import type { CdEntry, DiscogsReleaseTrack } from '../types';

export const MEDIA_CONDITIONS = ['Mint (M)', 'Near Mint (NM or M-)', 'Very Good Plus (VG+)', 'Very Good (VG)', 'Good Plus (G+)', 'Good (G)', 'Fair (F)', 'Poor (P)'];

export function formatDiscogsText(text: string): string {
  return text.replace(/(?:â€¢|Â·)/gu, ' - ').replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '$1').replace(/\[a=([^\]]+)\]/gi, '$1').replace(/\[r=?([0-9]+)\]/gi, 'Discogs release #$1').replace(/\[m=?([0-9]+)\]/gi, 'Discogs master #$1').replace(/\[l=?([0-9]+)\]/gi, 'Discogs label #$1').replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2 ($1)').replace(/\[\/?(?:i|u|s|quote|list|\*)\]/gi, '').trim();
}

export function previewDiscogsText(text: string, wordLimit = 50): string {
  const words = text.trim().split(/\s+/u);
  return words.length > wordLimit ? `${words.slice(0, wordLimit).join(' ')}…` : text;
}

export function formatMusicBrainzGenre(value: string): string {
  return value.toLocaleLowerCase().replace(/(^|[\s/&-])(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase()}`);
}

export function formatDiscogsMarketPrice(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return 'Not available';
  if (currency) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); } catch { /* fall through */ } }
  return `$${value.toFixed(2)}`;
}

export function formatDiscogsMarketDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

export function catalogCoverUrl(entry: Pick<CdEntry, 'id' | 'coverImageUpdatedAt'>): string {
  return `/api/cds/${entry.id}/cover${entry.coverImageUpdatedAt ? `?updated=${encodeURIComponent(entry.coverImageUpdatedAt)}` : ''}`;
}

export function cleanExternalSearchText(value: string): string {
  return value.replace(/\s*\(\d+\)(?=\s*(?:=|$))/gu, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').replace(/\s*(?:=|\/|\||-)\s*$/u, '').trim();
}

export const trackKey = (track: DiscogsReleaseTrack): string => `${track.position || ''}|${track.title}`;

export function trackDurationSeconds(duration: string | null): number | null {
  if (!duration) return null;
  const parts = duration.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0) || null;
}
