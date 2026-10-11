import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, '_site');
const publishable = ['about', 'index.html', 'assets', 'archive', 'issues', 'legal', 'read'];
const execFileAsync = promisify(execFile);

const titleFromSlug = (slug) => slug
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeText = (value) => value
  .toLocaleLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const matches = (source, terms) => terms.filter((term) => source.includes(normalizeText(term))).length;

// This deliberately compact, extensible vocabulary starts from the broad and
// overlapping genres in Wikipedia's "List of music genres and styles". Each
// issue receives one or two genres; no unbounded editorial tag taxonomy is shown.
const genreRules = [
  { name: 'Alternative', terms: ['alternative', 'indie rock', 'shoegaze', 'dream pop', '另類'] },
  { name: 'Ambient', terms: ['ambient', 'drone', '氛圍', '環境音樂'] },
  { name: 'Blues', terms: ['blues', '藍調'] },
  { name: 'Classical', terms: ['classical music', 'orchestra', 'symphony', 'opera', '古典音樂', '交響'] },
  { name: 'Country', terms: ['country music', 'bluegrass', '鄉村音樂'] },
  { name: 'Dance', terms: ['dance music', 'disco', 'dance-pop', '舞曲', '迪斯可'] },
  { name: 'Electronic', terms: ['electronic music', 'electronica', 'synth', '電子音樂', '合成器'] },
  { name: 'Experimental', terms: ['experimental', 'avant-garde', 'noise music', '實驗音樂', '前衛', '噪音音樂'] },
  { name: 'Folk', terms: ['folk music', 'singer-songwriter', '民謠', '傳統音樂'] },
  { name: 'Hip-hop', terms: ['hip-hop', 'hip hop', 'rap', '饒舌', '嘻哈'] },
  { name: 'House', terms: ['house music', 'deep house', 'tech house', '浩室'] },
  { name: 'Instrumental', terms: ['instrumental', '器樂', '純音樂'] },
  { name: 'Jazz', terms: ['jazz', 'bebop', 'swing', '爵士'] },
  { name: 'Metal', terms: ['metal music', 'heavy metal', 'black metal', '金屬'] },
  { name: 'Pop', terms: ['pop music', 'k-pop', 'j-pop', 'mandopop', '流行音樂', '華語流行'] },
  { name: 'Punk', terms: ['punk', 'hardcore', '龐克'] },
  { name: 'R&B / Soul', terms: ['r&b', 'rnb', 'rhythm and blues', 'soul music', '靈魂樂'] },
  { name: 'Reggae', terms: ['reggae', 'ska', 'dub', '雷鬼'] },
  { name: 'Rock', terms: ['rock music', 'rock band', '搖滾'] },
  { name: 'Techno', terms: ['techno', 'industrial techno', 'techno 音樂'] },
  { name: 'Traditional / World', terms: ['world music', 'traditional music', 'gamelan', '民俗音樂', '世界音樂'] }
];

const genericSearchTerms = new Set([
  'music', 'musical', 'song', 'songs', 'album', 'albums', 'artist', 'artists', 'ticket', 'tickets', 'buy', 'purchase', 'shop', 'store', 'merch', 'merchandise', 'event', 'events', 'listen', 'listening', 'audio', 'sound', 'the', 'and', 'with', 'from', 'this', 'that', 'for', 'are', 'was', 'you', 'your', 'our', 'their', 'music', '音樂', '歌曲', '專輯', '購票', '票券', '買', '購買', '商品', '周邊', '演出', '活動', '聆聽', '聲音', '這個', '那個', '我們', '他們', '以及'
]);

const hiddenSearchTerms = (sourceText) => {
  const latin = sourceText.match(/[\p{Script=Latin}][\p{Script=Latin}\d&'’-]{2,}/gu) || [];
  const han = sourceText.match(/[\p{Script=Han}]{2,12}/gu) || [];
  return [...new Set([...latin, ...han].map(normalizeText).filter((term) => {
    if (genericSearchTerms.has(term)) return false;
    const hasHan = /\p{Script=Han}/u.test(term);
    return hasHan ? term.length >= 2 : term.length >= 3;
  }))].slice(0, 220);
};

const issueMetadata = (title, sourceText) => {
  const source = normalizeText(`${title} ${sourceText}`);
  const rankedGenres = genreRules
    .map((genre) => ({ ...genre, score: matches(source, genre.terms) }))
    .sort((a, b) => b.score - a.score);
  const genres = rankedGenres.filter((genre) => genre.score).slice(0, 2).map((genre) => genre.name);
  // A genre remains mandatory even when a PDF makes no explicit genre claim.
  if (!genres.length) genres.push('Experimental');

  const sentences = sourceText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/u)
    .map((sentence) => sentence.trim());
  const excerpt = sentences
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 230)
    .find((sentence) => !/(tmfd|task force|cover.line|between the parts|type proof|not approved|type specimen)/i.test(sentence))
    || `A TMFD issue about ${genres.join(' and ').toLowerCase()}.`;
  return { genres, excerpt, searchTerms: hiddenSearchTerms(`${title} ${sourceText}`) };
};

const formatDate = (date) => new Intl.DateTimeFormat('en', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
}).format(new Date(`${date}T00:00:00Z`));

const decodeXml = (value) => value
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'");

const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const attribute = (source, name) => {
  const match = source.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : '';
};

const readingClass = ({ size, text }) => {
  if (size >= 48) return 'web-display';
  if (size >= 28) return 'web-heading';
  if (size >= 20 && text.length <= 70) return 'web-heading';
  if (size >= 18) return 'web-lede';
  if (text.length <= 80 && text === text.toUpperCase() && /[A-Z]/.test(text)) return 'web-eyebrow';
  return 'web-copy';
};

const readingTag = (className) => {
  if (className === 'web-display') return 'h1';
  if (className === 'web-heading') return 'h2';
  return 'p';
};

const rowGroups = (items) => {
  const rows = [];
  for (const item of items) {
    const row = rows.find((candidate) => Math.abs(candidate.top - item.top) <= 10);
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ top: item.top, items: [item] });
    }
  }
  return rows;
};

const renderReadingItem = (item) => {
  const className = readingClass(item);
  const tag = readingTag(className);
  return `<${tag} class="${className}">${escapeHtml(item.text)}</${tag}>`;
};

const joinReadingText = (left, right) => (
  /[\p{Script=Han}]/u.test(left.slice(-1)) && /^[\p{Script=Han}]/u.test(right) ? `${left}${right}` : `${left} ${right}`
);

const mergeReadingItems = (items) => {
  const merged = [];
  for (const item of items) {
    const previous = merged.at(-1);
    const canMerge = previous
      && readingClass(previous) === readingClass(item)
      && Math.abs(previous.left - item.left) <= 12
      && item.top - previous.top <= Math.max(item.size * 2.5, 65);
    if (canMerge) {
      previous.text = joinReadingText(previous.text, item.text);
      previous.top = item.top;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
};

// Converts a text-based PDF into a responsive reading edition. This is deliberately
// deterministic: it runs in GitHub Actions with Poppler and needs neither a key nor
// an external service. The PDF remains available as the layout-faithful original.
const buildReadingEdition = async (sourcePdf) => {
  const { stdout } = await execFileAsync('pdftohtml', [
    '-xml', '-stdout', '-hidden', '-i', sourcePdf
  ], { maxBuffer: 32 * 1024 * 1024 });

  const fontSizes = new Map(
    [...stdout.matchAll(/<fontspec\b([^>]*)\/>/g)].map(([, attrs]) => [
      attribute(attrs, 'id'), Number(attribute(attrs, 'size')) || 14
    ])
  );
  const sections = [];
  const textParts = [];
  for (const [, pageAttrs, pageBody] of stdout.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const pageHeight = Number(attribute(pageAttrs, 'height')) || 1;
    const items = [];
    for (const [, textAttrs, rawText] of pageBody.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const text = decodeXml(rawText).replace(/\s+/g, ' ').trim();
      const top = Number(attribute(textAttrs, 'top'));
      if (!text || !Number.isFinite(top) || top < 95 || top > pageHeight * 0.91) continue;
      textParts.push(text);
      items.push({
        text,
        top,
        left: Number(attribute(textAttrs, 'left')) || 0,
        size: fontSizes.get(attribute(textAttrs, 'font')) || 14
      });
    }
    if (!items.length) continue;

    const rows = rowGroups(items.sort((a, b) => a.top - b.top || a.left - b.left));
    const blocks = [];
    for (const { top, items: row } of rows) {
      const sorted = row.sort((a, b) => a.left - b.left);
      // pdf2xml sometimes splits one sentence into several font runs. Treat these
      // as a single line, never as magazine columns.
      if (sorted.length > 2) {
        const [first] = sorted;
        blocks.push({ type: 'single', top, className: readingClass(first), item: { ...first, text: sorted.map(({ text }) => text).join(' ') } });
        continue;
      }
      const isColumnRow = sorted.length === 2 && sorted.at(-1).left - sorted[0].left > 180;
      if (isColumnRow) {
        blocks.push({ type: 'grid', items: sorted });
        continue;
      }
      const item = sorted[0];
      const previous = blocks.at(-1);
      const closeToPrevious = previous?.type === 'single'
        && previous.className === readingClass(item)
        && Math.abs(previous.item.left - item.left) <= 10
        && top - previous.top <= Math.max(item.size * 1.9, 60);
      if (closeToPrevious) {
        previous.item.text = joinReadingText(previous.item.text, item.text);
        previous.top = top;
      } else {
        blocks.push({ type: 'single', top, className: readingClass(item), item });
      }
    }
    const arrangedBlocks = [];
    for (const block of blocks) {
      const previous = arrangedBlocks.at(-1);
      if (block.type === 'grid' && previous?.type === 'columns' && previous.rows[0].length === block.items.length) {
        previous.rows.push(block.items);
      } else if (block.type === 'grid') {
        arrangedBlocks.push({ type: 'columns', rows: [block.items], trailing: block.items.map(() => []) });
      } else if (previous?.type === 'columns'
        && previous.rows.at(-1)[0]
        && previous.rows.at(-1)[0].left === block.item.left
        && readingClass(previous.rows.at(-1)[0]) === readingClass(block.item)
        && block.top - previous.rows.at(-1)[0].top <= Math.max(block.item.size * 2.5, 75)) {
        previous.trailing[0].push(block.item);
      } else {
        arrangedBlocks.push(block);
      }
    }
    const content = arrangedBlocks.map((block) => {
      if (block.type === 'columns') {
        // Web editions deliberately read as one column: first the left PDF column,
        // then the right. This is more legible than preserving a print spread.
        const readingOrder = block.rows[0].flatMap((_, index) => mergeReadingItems(
          block.rows.map((row) => row[index]).concat(block.trailing[index])
        ));
        return `<div class="web-stack">${readingOrder.map((item) => `<div class="web-row">${renderReadingItem(item)}</div>`).join('')}</div>`;
      }
      return `<div class="web-row">${renderReadingItem(block.item)}</div>`;
    }).join('\n');
    sections.push(`<section class="web-section">${content}</section>`);
  }
  return {
    edition: sections.length ? `<article class="web-edition">${sections.join('\n')}</article>\n` : null,
    text: textParts.join(' ')
  };
};

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of publishable) {
  await cp(path.join(root, name), path.join(destination, name), { recursive: true, force: true });
}

const issueFolder = path.join(root, 'issues');
let filenames = [];
try { filenames = await readdir(issueFolder); } catch (_) { /* First issue has not been added yet. */ }

const issueGroups = new Map();
for (const filename of filenames) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+?)(?:\.(en|zh))?\.(pdf|html)$/);
  if (!match) continue;
  const [, date, slug, language = 'en', format] = match;
  const id = `${date}-${slug}`;
  if (!issueGroups.has(id)) issueGroups.set(id, { id, date, slug, files: { en: {}, zh: {} } });
  issueGroups.get(id).files[language][format] = filename;
}
const issues = [];
for (const group of issueGroups.values()) {
  const { id, date, slug } = group;
  const languages = {};
  let sourceText = titleFromSlug(slug);

  for (const language of ['en', 'zh']) {
    const files = group.files[language];
    if (!files.pdf && !files.html) continue;
    let web = null;
    if (files.pdf) {
      try {
        const conversion = await buildReadingEdition(path.join(issueFolder, files.pdf));
        sourceText += ` ${conversion.text}`;
        if (conversion.edition) {
          const folder = path.join(destination, 'reader-content');
          await mkdir(folder, { recursive: true });
          await writeFile(path.join(folder, `${id}.${language}.html`), conversion.edition);
          web = `reader-content/${id}.${language}.html`;
        }
      } catch (error) {
        console.warn(`Could not make a responsive reading edition for ${id} (${language}): ${error.message}`);
      }
    }
    languages[language] = {
      html: files.html ? `issues/${files.html}` : null,
      pdf: files.pdf ? `issues/${files.pdf}` : null,
      web
    };
  }

  const metadata = issueMetadata(titleFromSlug(slug), sourceText);

  issues.push({
    id,
    date,
    dateLabel: formatDate(date),
    title: titleFromSlug(slug),
    languages,
    ...metadata
  });
}
issues.sort((a, b) => b.date.localeCompare(a.date));

await mkdir(path.join(destination, 'data'), { recursive: true });
await writeFile(path.join(destination, 'data', 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Built TMFD site with ${issues.length} published issue(s).`);

