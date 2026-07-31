import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const MIN_HTML_REQUEST_INTERVAL_MS = 4_500;
let nextDiscogsHtmlRequestAt = 0;
const execFileAsync = promisify(execFile);
const DISCOGS_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

export type DiscogsMarketStats = {
  lastSoldAt: Date | null;
  low: number | null;
  median: number | null;
  high: number | null;
  currency: string | null;
};

export function retainKnownDiscogsMarketStats(previous: DiscogsMarketStats, current: DiscogsMarketStats): DiscogsMarketStats {
  return {
    lastSoldAt: current.lastSoldAt ?? previous.lastSoldAt,
    low: current.low ?? previous.low,
    median: current.median ?? previous.median,
    high: current.high ?? previous.high,
    currency: current.currency ?? previous.currency,
  };
}

type ParsedPrice = { value: number | null; currency: string | null };

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
}

function textContent(value: string): string {
  return decodeHtml(value.replace(/<!--.*?-->/gsu, '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim());
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function statisticContent(html: string, label: string): string | null {
  const expression = new RegExp(
    `<li\\b[^>]*>\\s*<span\\b[^>]*>\\s*${escapeRegex(label)}(?:\\s*<!--.*?-->\\s*)*:\\s*</span>\\s*(?<value>.*?)</li>`,
    'isu',
  );
  return expression.exec(html)?.groups?.value ?? null;
}

function parsePrice(content: string | null): ParsedPrice {
  if (!content) return { value: null, currency: null };
  const text = textContent(content);
  const match = /(?<currency>US\$|CA\$|A\$|[$€£¥])?\s*(?<amount>\d[\d,]*(?:\.\d+)?)/u.exec(text);
  if (!match?.groups?.amount) return { value: null, currency: null };
  const value = Number(match.groups.amount.replace(/,/gu, ''));
  if (!Number.isFinite(value)) return { value: null, currency: null };
  const currency = ({ '$': 'USD', 'US$': 'USD', 'CA$': 'CAD', 'A$': 'AUD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' } as Record<string, string>)[match.groups.currency ?? ''] ?? null;
  return { value, currency };
}

export function parseDiscogsMarketStats(html: string): DiscogsMarketStats {
  const section = /<section\b[^>]*\bid=["']release-stats["'][^>]*>(?<content>.*?)<\/section>/isu.exec(html)?.groups?.content;
  if (!section) return { lastSoldAt: null, low: null, median: null, high: null, currency: null };
  const lastSoldContent = statisticContent(section, 'Last Sold');
  const dateValue = /<time\b[^>]*\bdatetime=["'](?<value>[^"']+)["']/isu.exec(lastSoldContent ?? '')?.groups?.value;
  const lastSoldAt = dateValue && Number.isFinite(Date.parse(dateValue)) ? new Date(dateValue) : null;
  const prices = [parsePrice(statisticContent(section, 'Low')), parsePrice(statisticContent(section, 'Median')), parsePrice(statisticContent(section, 'High'))];
  return {
    lastSoldAt,
    low: prices[0].value,
    median: prices[1].value,
    high: prices[2].value,
    currency: prices.map((price) => price.currency).find((currency): currency is string => Boolean(currency)) ?? null,
  };
}

async function waitForHtmlRequestSlot(): Promise<void> {
  const scheduledAt = Math.max(Date.now(), nextDiscogsHtmlRequestAt);
  nextDiscogsHtmlRequestAt = scheduledAt + MIN_HTML_REQUEST_INTERVAL_MS;
  if (scheduledAt > Date.now()) await new Promise<void>((resolve) => setTimeout(resolve, scheduledAt - Date.now()));
}

export async function fetchDiscogsMarketStats(releaseId: number): Promise<DiscogsMarketStats> {
  await waitForHtmlRequestSlot();
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const { stdout } = await execFileAsync(curl, [
    '-L', '--fail', '--silent', '--show-error',
    '-A', DISCOGS_BROWSER_USER_AGENT,
    '-H', 'Accept-Language: en-US,en;q=0.9',
    `https://www.discogs.com/release/${releaseId}`,
  ], {
    encoding: 'utf8', timeout: 20_000, maxBuffer: 3_000_000, windowsHide: true,
  });
  return parseDiscogsMarketStats(stdout);
}
