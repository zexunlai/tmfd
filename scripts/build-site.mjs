import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
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

const assetNumber = (value) => String(value).padStart(3, '0');

// Every visual is derived from the issue PDF. The first page provides the
// horizontal cover crop; embedded raster artwork is placed after its source
// page in the responsive edition. Nothing extra needs to be uploaded.
const embeddedPdfImages = async (sourcePdf) => {
  const { stdout } = await execFileAsync('pdfimages', ['-list', sourcePdf]);
  return [...stdout.matchAll(/^\s*(\d+)\s+(\d+)\s+image\s+(\d+)\s+(\d+)\s+(\S+)/gm)].map(([, page, index, width, height, color]) => ({
    page: Number(page),
    index: Number(index),
    width: Number(width),
    height: Number(height),
    color
  }));
};

// The first PDF page is reserved for the designated cover. Its embedded images
// can include the TMFD wordmark, which is a publication identifier rather than
// editorial artwork, so none of them belong in the responsive article body.
// The ratio check also protects against wide wordmark panels used elsewhere.
const isWordmarkPanel = ({ width, height, color }) => (
  height > 0 && width / height > 2.5 && (color === 'gray' || width / height > 4)
);
const isLikelyLayoutAsset = ({ width, height }) => (
  // A repeated 1024 × 1536 JPEG is the PDF's shared page texture, not an
  // editorial photograph. It is intentionally absent from the web edition.
  width === 1024 && height === 1536
);
const minimumEditorialImageBytes = 40 * 1024;

const createPdfVisuals = async ({ sourcePdf, id, language }) => {
  const folder = path.join(destination, 'issue-assets', id);
  await mkdir(folder, { recursive: true });

  const coverBase = path.join(folder, `cover-${language}`);
  await execFileAsync('pdftoppm', [
    '-jpeg', '-singlefile', '-f', '1', '-l', '1',
    '-scale-to-x', '1600', '-scale-to-y', '-1', sourcePdf, coverBase
  ]);

  const mediaByPage = new Map();
  const imageCandidates = (await embeddedPdfImages(sourcePdf)).filter((image) => (
    image.page !== 1 && !isWordmarkPanel(image) && !isLikelyLayoutAsset(image)
  ));
  if (imageCandidates.length) {
    const imageBase = path.join(folder, `${language}-image`);
    await execFileAsync('pdfimages', ['-png', sourcePdf, imageBase]);
    for (const candidate of imageCandidates) {
      const { page, index } = candidate;
      const filename = `${language}-image-${assetNumber(index)}.png`;
      const imagePath = path.join(folder, filename);
      // Very small extracted images are PDF page textures or layout placeholders,
      // rather than editorial pictures. Do not create empty visual cards for them.
      if ((await stat(imagePath)).size < minimumEditorialImageBytes) continue;
      const image = {
        src: `../issue-assets/${id}/${filename}`,
        shape: candidate.width / candidate.height > 1.25 ? 'landscape' : candidate.height / candidate.width > 1.25 ? 'portrait' : 'square',
        alt: language === 'zh' ? '原始 PDF 中的編輯圖片' : 'Editorial image from the original PDF'
      };
      if (!mediaByPage.has(page)) mediaByPage.set(page, []);
      mediaByPage.get(page).push(image);
    }
  }

  return {
    cover: `issue-assets/${id}/cover-${language}.jpg`,
    mediaByPage
  };
};

const attribute = (source, name) => {
  const match = source.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : '';
};

const readingClass = ({ size, text, role, family = '' }) => {
  if (role === 'section-label') return 'web-section-label';
  if (role === 'credit') return 'web-credit';
  // PDFs retain their production fonts (for example Noto Serif CJK), whereas
  // the site applies the TMFD web type system. Serif display faces and scale
  // together identify editorial titles; sans faces at the same scale remain
  // reading text.
  const isTitleTypeface = /(?:Georgia|SimSun|NotoSerif)/iu.test(family);
  if (size >= 48) return 'web-display';
  if (size >= 34 || (isTitleTypeface && size >= 28)) return 'web-heading';
  if (isTitleTypeface && size >= 20 && text.length <= 90) return 'web-heading';
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
      && previous.role === item.role
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

const normaliseRunningLabel = (text) => text
  .toLocaleLowerCase()
  .replace(/[·•]/g, ' ')
  .replace(/\bcontinued\b/g, ' ')
  .replace(/續|繼續/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isPageNumber = (text) => /^\d{1,3}$/.test(text.trim());
const isRunningHeader = (item, pageHeight) => (
  item.top <= pageHeight * 0.14
  && item.size <= 20
  && /^\d{1,2}\s+/.test(item.text)
);
const isRunningHeaderRemainder = (item, pageHeight) => (
  item.top <= pageHeight * 0.14
  && item.size <= 20
  && (/^(?:[·•]|continued|續|繼續)$/iu.test(item.text) || item.text.length === 1)
);
const isPublicationCredit = (text) => /^(?:ze xun lai|tmfd independent music publication|tmfd vol\.|en revision|zh revision|繁中 revision)/i.test(text.trim());
const isPublicationFooterLabel = (text) => /^(?:publication|出版資訊)$/iu.test(text.trim());
const isContinuationLabel = (item) => /(?:[·•]\s*(?:continued|續|繼續))$/iu.test(item.text.trim());

// Print magazines frequently split a spread into two columns. The web edition
// uses a deliberate single-column reading order: all left-column material first,
// followed by the right column, while preserving type hierarchy within each.
const pageReadingFlow = (items, pageWidth) => {
  const split = pageWidth * 0.5;
  const hasRightColumn = items.some((item) => item.left >= split);
  const columns = hasRightColumn
    ? [items.filter((item) => item.left < split), items.filter((item) => item.left >= split)]
    : [items];

  return columns.flatMap((column) => {
    const lines = rowGroups(column.sort((a, b) => a.top - b.top || a.left - b.left))
      .map(({ top, items: row }) => {
        const sorted = row.sort((a, b) => a.left - b.left);
        const [first] = sorted;
        return {
          ...first,
          top,
          text: sorted.reduce((joined, item) => joined ? joinReadingText(joined, item.text) : item.text, '')
        };
      });
    return mergeReadingItems(lines);
  });
};

// Converts a text-based PDF into a responsive reading edition. This is deliberately
// deterministic: it runs in GitHub Actions with Poppler and needs neither a key nor
// an external service. The PDF remains available as the layout-faithful original.
const buildReadingEdition = async (sourcePdf, language, mediaByPage = new Map()) => {
  const { stdout } = await execFileAsync('pdftohtml', [
    '-xml', '-stdout', '-hidden', '-i', sourcePdf
  ], { maxBuffer: 32 * 1024 * 1024 });

  const fontSpecs = new Map(
    [...stdout.matchAll(/<fontspec\b([^>]*)\/>/g)].map(([, attrs]) => [
      attribute(attrs, 'id'), {
        size: Number(attribute(attrs, 'size')) || 14,
        family: attribute(attrs, 'family')
      }
    ])
  );
  const sections = [];
  const textParts = [];
  const emittedSectionLabels = new Set();
  for (const [pageIndex, [, pageAttrs, pageBody]] of [...stdout.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)].entries()) {
    const pageHeight = Number(attribute(pageAttrs, 'height')) || 1;
    const pageWidth = Number(attribute(pageAttrs, 'width')) || 1;
    const items = [];
    for (const [, textAttrs, rawText] of pageBody.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const text = decodeXml(rawText).replace(/\s+/g, ' ').trim();
      const top = Number(attribute(textAttrs, 'top'));
      const font = fontSpecs.get(attribute(textAttrs, 'font')) || { size: 14, family: '' };
      if (!text || !Number.isFinite(top) || top > pageHeight * 0.88 || isPageNumber(text)) continue;
      const item = {
        text,
        top,
        left: Number(attribute(textAttrs, 'left')) || 0,
        size: font.size,
        family: font.family
      };
      if (isRunningHeader(item, pageHeight)) {
        const key = normaliseRunningLabel(item.text);
        if (emittedSectionLabels.has(key)) continue;
        emittedSectionLabels.add(key);
        item.role = 'section-label';
      } else if (isRunningHeaderRemainder(item, pageHeight)) {
        continue;
      } else if ((isPublicationCredit(item.text) || isPublicationFooterLabel(item.text)) && pageIndex > 0) {
        // Publication details are part of the cover identity. Repeated bottom
        // matter is a print footer and should not interrupt web reading.
        continue;
      } else if (isPublicationCredit(item.text)) {
        item.role = 'credit';
      }
      textParts.push(text);
      items.push(item);
    }
    if (!items.length) continue;
    // A continuation heading can appear at the top of a second PDF column.
    // Its preceding heading is already present in the web flow, so omit only
    // the repeated continuation label—not its following editorial text.
    const readingOrder = pageReadingFlow(items, pageWidth)
      .filter((item) => !isContinuationLabel(item));
    const content = readingOrder.map((item) => `<div class="web-row">${renderReadingItem(item)}</div>`).join('\n');
    const media = (mediaByPage.get(pageIndex + 1) || []).map(({ src, alt, shape }) => (
      `<figure class="web-media web-media--${shape}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy"></figure>`
    )).join('');
    sections.push(`<section class="web-section">${content}${media}</section>`);
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

const issueGroups = new Map();
const issueFolder = path.join(root, 'issues');
// Each language has its own drop folder. An issue can be published with either
// one: the reader and homepage prefer English, then fall back to Chinese.
for (const language of ['en', 'zh']) {
  let filenames = [];
  try { filenames = await readdir(path.join(issueFolder, language)); } catch (_) { continue; }
  for (const filename of filenames) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+?)\.(pdf|html)$/);
    if (!match) continue;
    const [, date, filenameSlug, format] = match;
    // Keep the language visible in each filename without making it part of the
    // issue title or creating a separate issue. Older filenames without this
    // suffix remain supported.
    const slug = filenameSlug.replace(new RegExp(`-${language}$`, 'i'), '');
    if (!slug) continue;
    const id = `${date}-${slug}`;
    if (!issueGroups.has(id)) issueGroups.set(id, { id, date, slug, files: { en: {}, zh: {} } });
    issueGroups.get(id).files[language][format] = filename;
  }
}
const issues = [];
for (const group of issueGroups.values()) {
  const { id, date, slug } = group;
  const languages = {};
  const covers = {};
  let sourceText = titleFromSlug(slug);

  for (const language of ['en', 'zh']) {
    const files = group.files[language];
    if (!files.pdf && !files.html) continue;
    let web = null;
    if (files.pdf) {
      const sourcePdf = path.join(issueFolder, language, files.pdf);
      let visuals = { cover: null, mediaByPage: new Map() };
      try {
        visuals = await createPdfVisuals({ sourcePdf, id, language });
        covers[language] = visuals.cover;
      } catch (error) {
        console.warn(`Could not create PDF visuals for ${id} (${language}): ${error.message}`);
      }
      try {
        const conversion = await buildReadingEdition(sourcePdf, language, visuals.mediaByPage);
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
      html: files.html ? `issues/${language}/${files.html}` : null,
      pdf: files.pdf ? `issues/${language}/${files.pdf}` : null,
      web
    };
  }

  const metadata = issueMetadata(titleFromSlug(slug), sourceText);

  issues.push({
    id,
    date,
    dateLabel: formatDate(date),
    title: titleFromSlug(slug),
    cover: covers.en || covers.zh || null,
    covers,
    languages,
    ...metadata
  });
}
issues.sort((a, b) => b.date.localeCompare(a.date));

await mkdir(path.join(destination, 'data'), { recursive: true });
await writeFile(path.join(destination, 'data', 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Built TMFD site with ${issues.length} published issue(s).`);

