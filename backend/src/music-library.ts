import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma']);
const LOW_VALUE_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
const ALBUM_QUALIFIER_PATTERN = /\b(pt|part|vol|volume|disc)\.?\s*(\d+|[ivxlcdm]+)\b/giu;

type AlbumQualifier = {
  kind: 'installment' | 'disc';
  number: number;
};

function romanNumeralToNumber(value: string): number | null {
  const numerals: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const letters = value.toLowerCase();
  let result = 0;
  let previous = 0;
  for (const letter of [...letters].reverse()) {
    const current = numerals[letter];
    if (!current) return null;
    if (current < previous) result -= current;
    else { result += current; previous = current; }
  }
  return result || null;
}

function albumQualifierNumber(value: string): number | null {
  return /^\d+$/u.test(value) ? Number(value) : romanNumeralToNumber(value);
}

function albumQualifiers(value: string): AlbumQualifier[] {
  return [...value.matchAll(ALBUM_QUALIFIER_PATTERN)]
    .map((match) => {
      const number = albumQualifierNumber(match[2]);
      if (!number) return null;
      return { kind: match[1].toLowerCase() === 'disc' ? 'disc' : 'installment', number };
    })
    .filter((qualifier): qualifier is AlbumQualifier => qualifier !== null);
}

function sameAlbumQualifiers(left: AlbumQualifier[], right: AlbumQualifier[]): boolean {
  return left.length === right.length && left.every((qualifier, index) => qualifier.kind === right[index].kind && qualifier.number === right[index].number);
}

function canonicalizeAlbumQualifiers(value: string): string {
  return value.replace(ALBUM_QUALIFIER_PATTERN, (_match, type: string, ordinal: string) => {
    const number = albumQualifierNumber(ordinal);
    if (!number) return _match;
    return type.toLowerCase() === 'disc' ? `disc ${number}` : `installment ${number}`;
  });
}

export function normalizeMusicText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

function normalizedMusicTokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => {
      const collapsed = token.replace(/(.)\1+/gu, '$1');
      if (collapsed.length > 4 && collapsed.endsWith('ies')) return `${collapsed.slice(0, -3)}y`;
      if (collapsed.length > 4 && collapsed.endsWith('s') && !collapsed.endsWith('ss')) return collapsed.slice(0, -1);
      return collapsed;
    })
    .filter(Boolean);
}

function significantMusicTokens(value: string): string[] {
  const tokens = normalizedMusicTokens(value);
  const meaningfulTokens = tokens.filter((token) => !LOW_VALUE_WORDS.has(token));
  return meaningfulTokens.length ? meaningfulTokens : tokens;
}

export function scoreMusicTextMatch(requestedTitle: string, candidateTitle: string): number {
  const requested = normalizeMusicText(requestedTitle);
  const candidate = normalizeMusicText(candidateTitle);
  if (!requested || !candidate) return 0;
  if (requested === candidate) return 1;

  const relaxedRequested = requested.replace(/(.)\1+/gu, '$1');
  const relaxedCandidate = candidate.replace(/(.)\1+/gu, '$1');
  if (relaxedCandidate.includes(relaxedRequested) || relaxedRequested.includes(relaxedCandidate)) return 0.95;

  const requestedTokens = new Set(significantMusicTokens(requestedTitle));
  const candidateTokens = new Set(significantMusicTokens(candidateTitle));
  if (!requestedTokens.size || !candidateTokens.size) return 0;
  const sharedTokens = [...requestedTokens].filter((token) => candidateTokens.has(token)).length;
  const coverage = sharedTokens / requestedTokens.size;
  const precision = sharedTokens / candidateTokens.size;
  if (coverage < 0.6) return 0;
  return (coverage * 0.75) + (precision * 0.25);
}

export function scoreMusicTitleMatch(requestedTitle: string, candidateTitle: string): number {
  const requestedQualifiers = albumQualifiers(requestedTitle);
  const candidateQualifiers = albumQualifiers(candidateTitle);
  // A requested part/volume/disc must not silently fall back to an unqualified
  // base album or a different installment. A generic request may still match a
  // more specific candidate, preserving the existing disc-number behavior.
  if (requestedQualifiers.length && !sameAlbumQualifiers(requestedQualifiers, candidateQualifiers)) return 0;
  return scoreMusicTextMatch(canonicalizeAlbumQualifiers(requestedTitle), canonicalizeAlbumQualifiers(candidateTitle));
}

export function shortenedArtistSearch(value: string): string | null {
  const terms = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  return terms.length > 2 ? normalizeMusicText(terms.slice(0, -1).join(' ')) : null;
}

export function artistSearchFallbacks(value: string): string[] {
  const terms = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const fallbacks: string[] = [];
  while (terms.length > 2) {
    terms.pop();
    const candidate = normalizeMusicText(terms.join(' '));
    if (candidate) fallbacks.push(candidate);
  }
  return fallbacks;
}

export async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await fs.stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

export function pathIsWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export async function walkAudioFiles(rootPath: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await walkAudioFiles(entryPath, visit);
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      await visit(entryPath);
    }
  }
}

export async function readMusicFileMetadata(filePath: string) {
  const metadata = await parseFile(filePath, { skipCovers: true, duration: true });
  const artist = metadata.common.albumartist || metadata.common.artist || '';
  const album = metadata.common.album || '';
  const rawFileTitle = path.basename(filePath, path.extname(filePath)).replace(/^\d{1,3}[ ._-]+/u, '');
  const title = metadata.common.title || (artist && rawFileTitle.toLowerCase().startsWith(`${artist.toLowerCase()} - `)
    ? rawFileTitle.slice(artist.length + 3)
    : rawFileTitle);
  return {
    artist,
    album,
    title,
    trackNumber: metadata.common.track.no ?? null,
    discNumber: metadata.common.disk.no ?? null,
    durationSeconds: metadata.format.duration ?? null,
    format: metadata.format.container || path.extname(filePath).slice(1).toUpperCase(),
  };
}

export function contentTypeForAudioFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.flac': return 'audio/flac';
    case '.m4a': case '.aac': return 'audio/mp4';
    case '.ogg': case '.opus': return 'audio/ogg';
    case '.wav': return 'audio/wav';
    case '.wma': return 'audio/x-ms-wma';
    default: return 'audio/mpeg';
  }
}
