import { cli, Strategy } from '@jackwener/opencli/registry';

const SITE = 'rubysec';
const DOMAIN = 'rubysec.com';
const ROOT_URL = 'https://rubysec.com';
const ARCHIVE_URL = `${ROOT_URL}/advisories/archives/`;

function normalizeAdvisoryTarget(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${ROOT_URL}/advisories/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
  }
  return response.text();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .replace(/ +/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function extractBlock(html: string, pattern: RegExp): string {
  return pattern.exec(html)?.[1] ?? '';
}

function extractSection(html: string, heading: string, stopAt?: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedStop = stopAt ? stopAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  const pattern = stopAt
    ? new RegExp(`<h3>${escapedHeading}<\\/h3>([\\s\\S]*?)<h3(?: id="[^"]+")?>${escapedStop}<\\/h3>`, 'i')
    : new RegExp(`<h3>${escapedHeading}<\\/h3>([\\s\\S]*?)$`, 'i');
  return extractBlock(html, pattern);
}

function extractListItems(html: string): string[] {
  return Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi), (match) => cleanText(match[1])).filter(Boolean);
}

function extractLinks(html: string): string[] {
  return Array.from(html.matchAll(/<a[^>]+href="([^"]+)"/gi), (match) => new URL(match[1], ROOT_URL).toString());
}

function extractAdvisoryLinks(html: string): Array<{ label: string; links: Array<{ text: string; url: string }> }> {
  return Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi), (match) => {
    const itemHtml = match[1];
    return {
      label: cleanText(itemHtml),
      links: Array.from(itemHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi), (linkMatch) => ({
        text: cleanText(linkMatch[2]),
        url: new URL(linkMatch[1], ROOT_URL).toString(),
      })),
    };
  }).filter((item) => item.label || item.links.length);
}

cli({
  site: SITE,
  name: 'archives',
  description: 'List RubySec advisory archive entries',
  domain: DOMAIN,
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'year', type: 'int', help: 'Filter advisories by year' },
    { name: 'limit', type: 'int', default: 20, help: 'Maximum number of advisories' },
  ],
  columns: ['date', 'id', 'gem', 'title', 'url'],
  func: async (_page, kwargs) => {
    const year = kwargs.year ? Number(kwargs.year) : undefined;
    const limit = kwargs.limit ? Number(kwargs.limit) : 20;
    const html = await fetchHtml(ARCHIVE_URL);

    let currentYear = '';
    const advisories = Array.from(html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi), (match) => {
      const rowHtml = match[1];
      const yearMatch = rowHtml.match(/<td class="year">[\s\S]*?<strong>(\d{4})<\/strong>/i);
      if (yearMatch) currentYear = yearMatch[1];

      const date = rowHtml.match(/<time datetime="([^"]+)"/i)?.[1]?.slice(0, 10) ?? '';
      const href = rowHtml.match(/<a href="(\/advisories\/[^"#?]+\/)"/i)?.[1] ?? '';
      const title = cleanText(rowHtml.match(/<h3><a [^>]*>([\s\S]*?)<\/a><\/h3>/i)?.[1] ?? '');
      const id = href.match(/\/advisories\/([^/]+)\//i)?.[1] ?? '';
      const gem = title.match(/\(([^)]+)\)/)?.[1] ?? '';

      if (!date || !href || !title) return null;
      return {
        year: currentYear,
        date,
        id,
        gem,
        title,
        url: new URL(href, ROOT_URL).toString(),
      };
    }).filter((item): item is { year: string; date: string; id: string; gem: string; title: string; url: string } => Boolean(item));

    return advisories
      .filter((item) => !year || Number(item.year) === year)
      .slice(0, limit)
      .map(({ year: _year, ...item }) => item);
  },
});

cli({
  site: SITE,
  name: 'advisory',
  description: 'Read a RubySec advisory article',
  domain: DOMAIN,
  strategy: Strategy.PUBLIC,
  browser: false,
  defaultFormat: 'yaml',
  args: [
    { name: 'target', positional: true, required: true, help: 'Advisory ID or full RubySec advisory URL' },
  ],
  func: async (_page, kwargs) => {
    const url = normalizeAdvisoryTarget(kwargs.target);
    const html = await fetchHtml(url);
    const entryContent = extractBlock(html, /<div class="entry-content">([\s\S]*?)<\/div>\s*<footer>/i);

    return {
      id: new URL(url).pathname.split('/').filter(Boolean).pop() ?? '',
      title: cleanText(extractBlock(html, /<h1 class="entry-title">([\s\S]*?)<\/h1>/i)),
      date: html.match(/<time datetime="([^"]+)"/i)?.[1]?.slice(0, 10) ?? '',
      url,
      gem: cleanText(extractSection(entryContent, 'GEM', 'SEVERITY')),
      severity: cleanText(extractSection(entryContent, 'SEVERITY', 'PATCHED VERSIONS')),
      patched_versions: extractListItems(extractSection(entryContent, 'PATCHED VERSIONS', 'DESCRIPTION')),
      advisories: extractAdvisoryLinks(extractSection(entryContent, 'ADVISORIES', 'GEM')),
      description: cleanText(extractSection(entryContent, 'DESCRIPTION', 'RELATED')),
      related_links: extractLinks(extractSection(entryContent, 'RELATED')),
    };
  },
});
