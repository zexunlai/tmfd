import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

const phraseOccurrences = (source, phrase) => {
  const normalized = normalizeText(phrase);
  if (!normalized) return 0;
  // Normalisation puts spaces between Latin words. Matching complete phrases
  // stops a short word such as "rap" or "pop" from matching inside a name.
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const requiresWordBoundary = /[a-z]/u.test(normalized);
  const expression = requiresWordBoundary
    ? new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'gu')
    : new RegExp(escaped, 'gu');
  return [...source.matchAll(expression)].length;
};

const weightedSignals = (signals) => signals.map(([term, weight = 3]) => ({ term, weight }));

// This deliberately compact, extensible vocabulary starts from the broad and
// overlapping genres in Wikipedia's "List of music genres and styles". Each
// issue receives one or two genres; no unbounded editorial tag taxonomy is shown.
const genreRules = [
  { name: 'Alternative', signals: weightedSignals([['alternative', 4], ['indie rock', 5], ['shoegaze', 6], ['dream pop', 6], ['另類', 4]]) },
  { name: 'Ambient', signals: weightedSignals([['ambient', 5], ['drone', 5], ['氛圍', 4], ['環境音樂', 6]]) },
  { name: 'Blues', signals: weightedSignals([['blues', 5], ['藍調', 5]]) },
  { name: 'Classical', signals: weightedSignals([['classical music', 6], ['orchestra', 5], ['symphony', 6], ['opera', 6], ['古典音樂', 6], ['交響', 5]]) },
  { name: 'Country', signals: weightedSignals([['country music', 6], ['bluegrass', 6], ['鄉村音樂', 6]]) },
  { name: 'Dance', signals: weightedSignals([['dance music', 6], ['disco', 5], ['dance pop', 6], ['舞曲', 5], ['迪斯可', 5]]) },
  // An instrument alone is not a genre. "synth" and "合成器" intentionally
  // do not score here; an issue needs an explicit Electronic genre statement.
  { name: 'Electronic', signals: weightedSignals([['electronic music', 7], ['electronica', 7], ['electronic composition', 6], ['電子音樂', 7], ['電子樂', 7]]) },
  { name: 'Experimental', signals: weightedSignals([['experimental music', 7], ['experimental', 4], ['avant garde', 6], ['noise music', 7], ['實驗音樂', 7], ['前衛', 4], ['噪音音樂', 7]]) },
  { name: 'Folk', signals: weightedSignals([['folk music', 6], ['singer songwriter', 6], ['民謠', 6], ['傳統音樂', 6]]) },
  { name: 'Hip-hop', signals: weightedSignals([['hip hop', 7], ['rap music', 6], ['饒舌', 7], ['嘻哈', 7]]) },
  { name: 'House', signals: weightedSignals([['house music', 7], ['deep house', 7], ['tech house', 7], ['浩室', 7]]) },
  { name: 'Instrumental', signals: weightedSignals([['instrumental music', 7], ['instrumental rock', 6], ['instrumental', 3], ['器樂搖滾', 6], ['器樂', 3], ['純音樂', 7]]) },
  { name: 'Jazz', signals: weightedSignals([['jazz', 5], ['bebop', 7], ['swing', 5], ['爵士', 5]]) },
  { name: 'Metal', signals: weightedSignals([['progressive metal', 7], ['metal music', 7], ['heavy metal', 7], ['black metal', 7], ['金屬', 5]]) },
  { name: 'Pop', signals: weightedSignals([['independent pop', 5], ['pop music', 6], ['k pop', 7], ['j pop', 7], ['mandopop', 7], ['流行音樂', 6], ['華語流行', 7]]) },
  { name: 'Punk', signals: weightedSignals([['punk', 6], ['hardcore', 6], ['龐克', 6]]) },
  { name: 'R&B / Soul', signals: weightedSignals([['r b', 7], ['rnb', 7], ['rhythm and blues', 7], ['soul music', 7], ['靈魂樂', 7]]) },
  { name: 'Reggae', signals: weightedSignals([['reggae', 7], ['ska', 6], ['dub', 5], ['雷鬼', 7]]) },
  { name: 'Rock', signals: weightedSignals([['post rock', 7], ['math rock', 7], ['instrumental rock', 6], ['taiwanese rock', 6], ['rock music', 6], ['rock band', 5], ['搖滾', 5]]) },
  { name: 'Techno', signals: weightedSignals([['industrial techno', 7], ['techno music', 7], ['techno 音樂', 7], ['techno', 5]]) },
  { name: 'Traditional / World', signals: weightedSignals([['world music', 7], ['traditional music', 7], ['gamelan', 7], ['民俗音樂', 7], ['世界音樂', 7]]) }
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

const editionLabelFromText = (sourceText) => {
  const match = sourceText.match(/\b(?:english|traditional chinese|chinese)?\s*(vol\.?\s*\d{1,3})\s+edition\b/iu);
  if (!match) return '';
  const volume = match[1].replace(/^vol\.?/iu, 'Vol.').replace(/\s+/g, ' ').trim();
  return `${volume} Edition`;
};

const truncateSummary = (value, limit = 240) => {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const wordBreak = clean.lastIndexOf(' ', limit);
  const end = wordBreak > limit * 0.6 ? wordBreak : limit;
  return `${clean.slice(0, end).trim()}…`;
};

const issueMetadata = (title, sourceText, coverSummary = '') => {
  const source = normalizeText(`${title} ${sourceText}`);
  const rankedGenres = genreRules
    .map((genre) => ({
      ...genre,
      score: genre.signals.reduce((total, { term, weight }) => total + phraseOccurrences(source, term) * weight, 0)
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const primary = rankedGenres.find((genre) => genre.score > 0);
  const secondary = rankedGenres.find((genre) => (
    genre !== primary
    && genre.score >= 6
    && genre.score >= primary.score * 0.55
  ));
  const genres = [primary, secondary].filter(Boolean).map((genre) => genre.name);
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
  return {
    genres,
    editionLabel: editionLabelFromText(sourceText),
    excerpt: coverSummary || excerpt,
    searchTerms: hiddenSearchTerms(`${title} ${sourceText}`)
  };
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

// `pdfimages -list` reports the PDF object's internal number. That number is
// not guaranteed to be the filename sequence emitted by `pdfimages -png` on
// every Poppler version (including the GitHub Pages build environment). Read
// the actual PNG header instead, then pair each source image by its dimensions.
// This keeps a photograph with the text that belongs to it across builds.
const pngDimensions = async (filename) => {
  const header = await readFile(filename);
  if (header.length < 24 || header.toString('ascii', 1, 4) !== 'PNG') return null;
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    // PNG colour types 0/4 are grayscale; 2/3/6 carry colour. A PDF soft
    // mask has the same dimensions as its photo, so this distinction prevents
    // a mask from ever being selected as the editorial image.
    grayscale: [0, 4].includes(header[25])
  };
};

const extractedPngAssets = async (folder, language) => {
  const prefix = `${language}-image-`;
  const filenames = (await readdir(folder))
    .filter((filename) => filename.startsWith(prefix) && filename.endsWith('.png'))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return (await Promise.all(filenames.map(async (filename) => {
    const filenamePath = path.join(folder, filename);
    const [dimensions, details] = await Promise.all([pngDimensions(filenamePath), stat(filenamePath)]);
    return dimensions && details.size >= minimumEditorialImageBytes
      ? { filename, ...dimensions }
      : null;
  }))).filter(Boolean);
};

const createPdfVisuals = async ({ sourcePdf, id, language }) => {
  const folder = path.join(destination, 'issue-assets', id);
  await mkdir(folder, { recursive: true });

  const coverBase = path.join(folder, `cover-${language}`);
  await execFileAsync('pdftoppm', [
    '-jpeg', '-singlefile', '-f', '1', '-l', '1',
    '-scale-to-x', '1600', '-scale-to-y', '-1', sourcePdf, coverBase
  ]);

  // Native browser PDF viewers do not offer a dependable two-page mode.
  // Build compact page pixels so the desktop reader can present real A4
  // spreads while the original PDF remains available for direct opening.
  const pdfPageBase = path.join(folder, `${language}-pdf-page`);
  await execFileAsync('pdftoppm', [
    '-jpeg', '-scale-to-x', '1000', '-scale-to-y', '-1', sourcePdf, pdfPageBase
  ]);
  const pdfPages = (await readdir(folder))
    .filter((filename) => filename.startsWith(`${language}-pdf-page-`) && filename.endsWith('.jpg'))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((filename) => `issue-assets/${id}/${filename}`);

  const mediaByPage = new Map();
  const imageCandidates = (await embeddedPdfImages(sourcePdf)).filter((image) => (
    image.page !== 1 && !isWordmarkPanel(image) && !isLikelyLayoutAsset(image)
  ));
  if (imageCandidates.length) {
    const imageBase = path.join(folder, `${language}-image`);
    await execFileAsync('pdfimages', ['-png', sourcePdf, imageBase]);
    const extractedImages = await extractedPngAssets(folder, language);
    for (const candidate of imageCandidates) {
      const { page } = candidate;
      const extractedIndex = extractedImages.findIndex((image) => (
        image.width === candidate.width
        && image.height === candidate.height
        && (candidate.color === 'gray' ? image.grayscale : !image.grayscale)
      ));
      // Very small extracted images are PDF page textures or layout placeholders,
      // rather than editorial pictures. A missing exact-size match is safer to
      // omit than to show a different photograph next to the wrong article.
      if (extractedIndex === -1) continue;
      const [extracted] = extractedImages.splice(extractedIndex, 1);
      const image = {
        src: `../issue-assets/${id}/${extracted.filename}`,
        shape: extracted.width / extracted.height > 1.25 ? 'landscape' : extracted.height / extracted.width > 1.25 ? 'portrait' : 'square',
        alt: language === 'zh' ? '原始 PDF 中的編輯圖片' : 'Editorial image from the original PDF'
      };
      if (!mediaByPage.has(page)) mediaByPage.set(page, []);
      mediaByPage.get(page).push(image);
    }
  }

  return {
    cover: `issue-assets/${id}/cover-${language}.jpg`,
    mediaByPage,
    pdfPages
  };
};

const attribute = (source, name) => {
  const match = source.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : '';
};

const readingClass = ({ size, text, role, family = '' }) => {
  // The web edition deliberately has only five editorial type scales:
  // 32 / 20 / 16 / 14 / 10 pt.  PDF point sizes are used only to identify
  // their role; CSS applies the controlled TMFD web scale.
  if (role === 'section-label' || role === 'credit') return 'web-meta';
  if (role === 'work') return 'web-work';
  // A work title follows its artist heading in the reading flow.  It is an
  // editorial lead rather than a second artist heading.
  if (role === 'song') return 'web-intro';
  // PDFs retain their production fonts (for example Noto Serif CJK), whereas
  // the site applies the TMFD web type system. Serif display faces and scale
  // together identify editorial titles; sans faces at the same scale remain
  // reading text.
  const isTitleTypeface = /(?:Georgia|SimSun|NotoSerif)/iu.test(family);
  if (size >= 48) return 'web-section-title';
  if (size >= 34 || (isTitleTypeface && size >= 28)) return 'web-secondary';
  if (isTitleTypeface && size >= 20 && text.length <= 90) return 'web-secondary';
  if (size >= 18) return 'web-intro';
  if (text.length <= 80 && text === text.toUpperCase() && /[A-Z]/.test(text)) return 'web-meta';
  return 'web-body';
};

const readingTag = (className) => {
  if (className === 'web-section-title') return 'h1';
  if (className === 'web-secondary') return 'h2';
  if (className === 'web-work') return 'h3';
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

const renderReadingText = (value, language) => {
  if (language !== 'zh') return escapeHtml(value);
  // A Chinese edition can contain artist names, work titles and English
  // quotations. Keep those Latin-language runs in the same type family as an
  // English page, while the surrounding Chinese follows its own type rule.
  return value.split(/([A-Za-z][A-Za-z0-9À-ÿ'’&.,:;!?/()\-]*(?:\s+[A-Za-z0-9À-ÿ'’&.,:;!?/()\-]+)*)/gu)
    .map((part) => (/^[A-Za-z]/u.test(part)
      ? `<span lang="en">${escapeHtml(part)}</span>`
      : escapeHtml(part)))
    .join('');
};

const renderReadingItem = (item, language) => {
  const className = readingClass(item);
  const tag = readingTag(className);
  const text = renderReadingText(item.text, language);
  const content = item.href
    ? `<a class="pdf-link" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    : text;
  return `<${tag} class="${className}">${content}</${tag}>`;
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
      && previous.href === item.href
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

// A PDF can emit one date as several text objects (for example, "2026 年",
// "10", "月", "11", "日"). Keep numeric text unless both its size and
// placement identify it as a running page number.
const isStandalonePageNumber = (item, pageWidth, pageHeight) => (
  /^\d{1,3}$/.test(item.text.trim())
  && item.size <= 14
  && item.top <= pageHeight * 0.12
  && (item.left <= pageWidth * 0.12 || item.left >= pageWidth * 0.82)
);
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
const isPublicationFooterFragment = (item, pageHeight) => (
  /^\d{1,2}$/.test(item.text.trim()) && item.top >= pageHeight * 0.72
);
const isContinuationLabel = (item) => /(?:[·•]\s*(?:continued|續|繼續))$/iu.test(item.text.trim());
const isExternalHref = (href) => /^(?:https?:\/\/|mailto:)/iu.test(href);
const linkFromPdfText = (rawText) => {
  const href = decodeXml(attribute(rawText, 'href'));
  return isExternalHref(href) ? href : '';
};
const isInternalPdfLink = (rawText) => Boolean(attribute(rawText, 'href')) && !linkFromPdfText(rawText);
const internalPdfPage = (href) => Number((href.match(/#(\d+)$/) || [])[1]) || null;
// Some PDF exporters preserve printed contents but discard the internal link
// annotations.  The site must still have a real, navigable contents menu in
// that case, so read its numbered entries from their visible layout.
const unlinkedContents = (rawTextElements) => {
  const entries = rawTextElements.map(([, textAttrs, rawText]) => ({
    text: decodeXml(rawText).replace(/\s+/g, ' ').trim(),
    top: Number(attribute(textAttrs, 'top')) || 0,
    left: Number(attribute(textAttrs, 'left')) || 0,
    bold: /<b>/iu.test(rawText)
  })).filter((item) => item.text);
  const hasContentsHeading = entries.some(({ text }) => /^(?:contents|本期目錄)$/iu.test(text));
  if (!hasContentsHeading) return [];

  // Chinese contents use a bold chapter label such as “01 編者的話”, while
  // its target page is printed on the following line.  Recover both pieces
  // from their shared column before falling back to the title-and-page form.
  const numbered = entries.flatMap((entry) => {
    if (!/^\d{2}$/u.test(entry.text)) return [];
    const title = entries.find((candidate) => candidate !== entry
      && candidate.bold
      && candidate.left > entry.left
      && Math.abs(candidate.top - entry.top) <= 12);
    const page = entries.find((candidate) => candidate.left >= entry.left - 3
      && candidate.left <= entry.left + 180
      && candidate.top > entry.top + 18
      && candidate.top < entry.top + 78
      && /[·•]\s*\d{1,3}\s*$/u.test(candidate.text));
    const pageNumber = page ? Number((page.text.match(/(\d{1,3})\s*$/u) || [])[1]) : 0;
    return title && pageNumber
      ? [{ number: entry.text, title: title.text, page: pageNumber + 1 }]
      : [];
  });
  if (numbered.length >= 4) return numbered;

  // English contents commonly put “Title · 2” in one text object.  The
  // printed page count starts after the cover and contents, hence +1.
  const titled = entries.flatMap(({ text }) => {
    const match = text.match(/^(.+?)\s*[·•]\s*(\d{1,3})\s*$/u);
    if (!match || /^(?:tmfd|contents)$/iu.test(match[1])) return [];
    return [{ title: match[1].trim(), page: Number(match[2]) + 1 }];
  });
  return titled.length >= 4
    ? titled.map((entry, index) => ({ ...entry, number: String(index + 1).padStart(2, '0') }))
    : [];
};
const isDateLine = (text) => /(?:\b(?:19|20)\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d{1,2}\s*月)/iu.test(text);
const markWorkTitles = (items) => items.map((item, index, list) => {
  if (readingClass(item) !== 'web-secondary') return item;
  // A work card in the PDF is normally laid out as artist, work title, then
  // year/date. Those are separate text objects, so examining only the very
  // next line loses the artist heading and can attach its image to a different
  // card. Keep the complete three-line identity together.
  const identityLines = list.slice(index, index + 4);
  if (identityLines.some((entry) => /\b(?:19|20)\d{2}\b/u.test(entry.text) || isDateLine(entry.text))) {
    return { ...item, role: 'work' };
  }
  return item;
});

// A small number of print layouts place an artist name and a song title in
// one oversized visual row. Keep their semantic hierarchy explicit online:
// artist as the card heading, then song title, then year. This is deliberately
// a narrowly scoped editorial override; it prevents the reader from treating
// a song title as part of a band's name when the PDF has no structural markup.
const normaliseArtistSongIdentity = (items, language) => {
  const identityIndex = items.findIndex((item, index) => (
    item.text.length <= 160
    && /(?:no party for cao dong|草東沒有派對)/iu.test(item.text)
    && items.slice(index + 1, index + 4).some((candidate) => isStandaloneDateOrYear(candidate.text))
  ));
  if (identityIndex < 0) return items;

  const identity = items[identityIndex];
  const artist = language === 'zh'
    ? '草東沒有派對'
    : 'No Party For Cao Dong (草東沒有派對)';
  const song = language === 'zh' ? '大風吹' : 'Simon Says (大風吹)';
  const result = [];
  for (const [index, item] of items.entries()) {
    if (index === identityIndex) {
      result.push(
        { ...item, text: artist, href: '', role: 'work' },
        { ...item, text: song, href: '', role: 'song', top: item.top + Math.max(item.size, 1) }
      );
      continue;
    }
    // The PDF occasionally emits the song title in a separate nearby object;
    // it was just represented above, so prevent a duplicate title.
    if (index < identityIndex + 3 && /(?:simon says|大風吹)/iu.test(item.text)) continue;
    result.push(item);
  }
  return result;
};

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
        const hrefs = [...new Set(sorted.map((item) => item.href).filter(Boolean))];
        return {
          ...first,
          top,
          href: hrefs.length === 1 ? hrefs[0] : '',
          text: sorted.reduce((joined, item) => joined ? joinReadingText(joined, item.text) : item.text, '')
        };
      });
    return mergeReadingItems(lines);
  });
};

const renderMedia = ({ src, alt, shape }) => (
  `<figure class="web-media web-media--${shape}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy"></figure>`
);

// Image credits belong in the final credits chapter, rather than interrupting
// the reading flow beside every image.  Mark only captions and attribution
// rows, never a work year, venue detail or editorial paragraph that happens
// to sit next to an image in the original PDF.
const isImageSource = ({ text, href = '' }) => (
  /(?:commons\.wikimedia\.org|creativecommons\.org)/iu.test(href)
  || /(?:\bcc\s*by(?:-sa)?\b|archive (?:image|performance image)|licensed (?:publicity )?photograph|official (?:artist|brand|product) image|official video|editorial (?:citation|use)|(?:image|video)\.?$|(?:歷史|官方|演出|現場|授權|宣傳|產品|品牌)?(?:影像|圖片|照片|影片)[。.]?$|圖像來源|圖片來源|影像來源|影片截圖|官方影片畫面|授權)/iu.test(text.trim())
);
const isStandaloneDateOrYear = (text) => (
  /^\s*(?:\d{4}|\d{1,2}\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*[·,/-]?\s*\d{0,4}|\d{1,2}\s*月\s*\d{0,2}\s*日?)\s*$/iu.test(text)
);
const isEventDetail = (text) => /(?:\b(?:doors?|show|admission|tickets?)\b|\d{1,2}:\d{2}|入場|開演|售票|票價)/iu.test(text);
const isImageCaption = (item, followingItem) => {
  if (isImageSource(item)) return true;
  if (!followingItem || !isImageSource(followingItem) || item.href) return false;
  const text = item.text.trim();
  // A short non-link line immediately before a credit is generally a caption.
  // Protect release years and performance information, which are article data.
  return readingClass(item) === 'web-body'
    && text.length > 12
    && text.length <= 140
    && !isStandaloneDateOrYear(text)
    && !isEventDetail(text);
};

// PDF pages do not retain a useful article-level image anchor.  Keep each
// image with its original PDF page, but distribute the source page's reading
// flow around it in alternating editorial pairs instead of placing all visual
// material at the end of the text.
const renderEditorialSection = (items, media, pageIndex, language) => {
  const isBlockHeading = (item) => ['web-section-title', 'web-secondary', 'web-work'].includes(readingClass(item));
  const rows = (entries, markImageSources = false) => entries.map((item, index) => {
    // Source lines and their preceding visual captions are retained in the
    // final Credits & Sources chapter only.  They must never occupy article
    // space beside an image in the responsive edition.
    const imageSource = markImageSources && (isImageSource(item) || isImageCaption(item, entries[index + 1]));
    return `<div class="web-row${isBlockHeading(item) ? ' web-row--heading' : ''}${imageSource ? ' web-image-source' : ''}">${renderReadingItem(item, language)}</div>`;
  }).join('\n');

  // In the final credits page, a single image source is often wrapped by the
  // PDF compositor into two lines (for example, "CC BY-" / "SA 2.0"), then
  // followed by its source link. Keep that one record together online; begin
  // a new line only for the next image's record.
  const sourceHeading = (item) => /^(?:影像|images?)$/iu.test(item.text.trim());
  const nextSourceHeading = (item) => readingClass(item) === 'web-secondary' && !sourceHeading(item);
  const sourceLink = (item) => /^(?:來源(?:\s*\/\s*授權)?|授權|\/|source\s*\/\s*licence)$/iu.test(item.text.trim()) && Boolean(item.href);
  const licenseContinuation = (item) => /^(?:(?:cc\s*)?by-?sa|sa\s+\d|cc\s*by|by\s*\d|cc\s*$)/iu.test(item.text.trim());
  const isSourcesSection = items.some((item) => /(?:credits\s*(?:&|and)\s*sources|影像與資料)/iu.test(item.text));
  const renderSourcesSection = () => {
    let collecting = false;
    let record = null;
    const output = [];
    const flush = () => {
      if (!record) return;
      const text = renderReadingText(record.text, language);
      // The source label is a print-only affordance.  Keep its destination by
      // making the actual source record clickable, without repeating a label.
      const content = record.link
        ? `<a class="pdf-link" href="${escapeHtml(record.link.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
        : text;
      output.push(`<div class="web-row web-source-record"><p class="web-body">${content}</p></div>`);
      record = null;
    };
    for (const item of items) {
      if (sourceHeading(item)) {
        flush();
        collecting = true;
        output.push(rows([item]));
        continue;
      }
      if (collecting && nextSourceHeading(item)) {
        flush();
        collecting = false;
        output.push(rows([item]));
        continue;
      }
      if (!collecting) {
        output.push(rows([item]));
        continue;
      }
      if (sourceLink(item) && record) {
        // Chinese PDFs can split 「來源 / 授權」 into three linked text
        // objects.  They all identify the same preceding record.
        record.link ||= item;
      } else if (licenseContinuation(item) && record) {
        record.text = /[-/]$/u.test(record.text) ? `${record.text}${item.text}` : joinReadingText(record.text, item.text);
      } else {
        flush();
        record = { ...item };
      }
    }
    flush();
    return output.join('\n');
  };
  if (isSourcesSection) return renderSourcesSection();
  if (!media.length) return `<div class="web-feature web-feature--text-only"><div class="web-feature-copy">${rows(items)}</div></div>`;

  // A print page can contain several discrete stories. Split before every
  // editorial heading, so a band/album heading is always a full-width start
  // to its own block rather than text squeezed beside an earlier photograph.
  const blocks = [];
  for (const item of items) {
    if (isBlockHeading(item) && blocks.at(-1)?.length) blocks.push([]);
    if (!blocks.length) blocks.push([]);
    blocks.at(-1).push(item);
  }
  const hasProse = (block) => block.some((item) => ['web-intro', 'web-body'].includes(readingClass(item)));
  // A PDF commonly separates an artist, work title and its copy into distinct
  // heading blocks. Rejoin heading-only lead-ins with the next prose block so
  // they form one complete editorial unit before media is matched to it.
  const completeBlocks = [];
  let pendingHeadings = [];
  for (const block of blocks) {
    if (!hasProse(block)) {
      pendingHeadings.push(...block);
    } else {
      completeBlocks.push([...pendingHeadings, ...block]);
      pendingHeadings = [];
    }
  }
  if (pendingHeadings.length) completeBlocks.push(pendingHeadings);
  blocks.length = 0;
  blocks.push(...completeBlocks);
  const visualsByBlock = blocks.map(() => []);
  const storyBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.some((item) => readingClass(item) === 'web-work'))
    .map(({ index }) => index);
  const proseBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => hasProse(block))
    .map(({ index }) => index);
  const visualTargets = storyBlocks.length ? storyBlocks : (proseBlocks.length ? proseBlocks : blocks.map((_, index) => index));
  media.forEach((image, index) => {
    // An extracted image stays in PDF order. Once work-card headings have been
    // identified, map that order directly to the corresponding story block on
    // the page. This keeps, for example, the left card's image with the left
    // card rather than swapping it with the next column on mobile or desktop.
    const target = visualTargets[Math.min(index, visualTargets.length - 1)];
    visualsByBlock[target].push(image);
  });
  // Never create a visual card that contains only a heading and an image.
  // If a print spread uses a decorative section opener, carry the image to the
  // next complete prose block so there is always real text to wrap around it.
  visualsByBlock.forEach((visuals, index) => {
    if (!visuals.length || hasProse(blocks[index])) return;
    const next = blocks.findIndex((block, candidate) => candidate > index && hasProse(block));
    const previous = [...blocks].reverse().findIndex((block, reverseIndex) => (
      blocks.length - reverseIndex - 1 < index && hasProse(block)
    ));
    const target = next >= 0 ? next : (previous >= 0 ? blocks.length - previous - 1 : -1);
    if (target >= 0) {
      visualsByBlock[target].push(...visuals);
      visuals.length = 0;
    }
  });

  let visualIndex = 0;
  return blocks.map((block, blockIndex) => {
    const visuals = visualsByBlock[blockIndex];
    if (!visuals.length) return `<div class="web-feature web-feature--text-only"><div class="web-feature-copy">${rows(block)}</div></div>`;
    let leadCount = 0;
    while (leadCount < block.length && (isBlockHeading(block[leadCount]) || readingClass(block[leadCount]) === 'web-meta')) leadCount += 1;
    const heading = block.slice(0, leadCount);
    const copy = block.slice(leadCount);
    const chunkSize = Math.max(1, Math.ceil(copy.length / visuals.length));
    return visuals.map((image, index) => {
      const prose = copy.slice(index * chunkSize, (index + 1) * chunkSize);
      // The first visual in every editorial section belongs on the right.
      // Further visuals alternate left/right within that same section.
      const reverse = visualIndex++ % 2 === 1;
      return `<div class="web-feature${reverse ? ' web-feature--reverse' : ''}">${index === 0 && heading.length ? `<div class="web-feature-heading">${rows(heading)}</div>` : ''}${renderMedia(image)}<div class="web-feature-copy">${rows(prose, true)}</div></div>`;
    }).join('\n');
  }).join('\n');
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
  const contents = [];
  const emittedSectionLabels = new Set();
  let coverSummary = '';
  for (const [pageIndex, [, pageAttrs, pageBody]] of [...stdout.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)].entries()) {
    const pageHeight = Number(attribute(pageAttrs, 'height')) || 1;
    const pageWidth = Number(attribute(pageAttrs, 'width')) || 1;
    const rawTextElements = [...pageBody.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)];
    // The print contents page is a collection of internal PDF links. Its
    // browser counterpart is created as a persistent clickable sidebar.
    if (rawTextElements.filter(([, , rawText]) => isInternalPdfLink(rawText)).length >= 8) {
      let previous = null;
      let pendingNumber = null;
      for (const [, textAttrs, rawText] of rawTextElements) {
        const text = decodeXml(rawText).replace(/\s+/g, ' ').trim();
        const href = attribute(rawText, 'href');
        const font = fontSpecs.get(attribute(textAttrs, 'font')) || { size: 14 };
        const entry = text.match(/^(\d{2})\s+(.+)$/u);
        if (entry && href && isInternalPdfLink(rawText)) {
          previous = {
            number: entry[1],
            title: entry[2].trim(),
            page: internalPdfPage(href),
            href,
            size: font.size
          };
          contents.push(previous);
          pendingNumber = null;
        } else if (/^\d{2}$/u.test(text) && href && isInternalPdfLink(rawText)) {
          // Chinese PDFs commonly place the chapter number and its title in
          // separate text objects. Hold the number until its bold neighbour.
          pendingNumber = { number: text, page: internalPdfPage(href), href };
        } else if (pendingNumber && href === pendingNumber.href && /<b>/iu.test(rawText) && text) {
          previous = { ...pendingNumber, title: text, size: font.size };
          contents.push(previous);
          pendingNumber = null;
        } else if (previous && href === previous.href && font.size === previous.size && text) {
          // Long chapter names can wrap onto a second line in the print TOC.
          previous.title = `${previous.title} ${text}`.replace(/\s+/g, ' ').trim();
        }
      }
      continue;
    }
    const recoveredContents = unlinkedContents(rawTextElements);
    if (recoveredContents.length) {
      contents.push(...recoveredContents);
      continue;
    }
    const items = [];
    for (const [, textAttrs, rawText] of rawTextElements) {
      const text = decodeXml(rawText).replace(/\s+/g, ' ').trim();
      const top = Number(attribute(textAttrs, 'top'));
      const font = fontSpecs.get(attribute(textAttrs, 'font')) || { size: 14, family: '' };
      if (!text || !Number.isFinite(top) || top > pageHeight * 0.88) continue;
      const item = {
        text,
        top,
        left: Number(attribute(textAttrs, 'left')) || 0,
        size: font.size,
        family: font.family,
        href: linkFromPdfText(rawText)
      };
      if (isStandalonePageNumber(item, pageWidth, pageHeight)) continue;
      if (isRunningHeader(item, pageHeight)) {
        const key = normaliseRunningLabel(item.text);
        if (emittedSectionLabels.has(key)) continue;
        emittedSectionLabels.add(key);
        item.role = 'section-label';
      } else if (isRunningHeaderRemainder(item, pageHeight)) {
        continue;
      } else if ((isPublicationCredit(item.text) || isPublicationFooterLabel(item.text) || isPublicationFooterFragment(item, pageHeight)) && pageIndex > 0) {
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
    const pageFlow = pageReadingFlow(items, pageWidth)
      .filter((item) => !isContinuationLabel(item));
    // Credits are records, not artist/work cards. Never apply editorial-card
    // normalisation there or one source record can be split into two rows.
    const isCreditsPage = pageFlow.some((item) => /(?:credits\s*(?:&|and)\s*sources|影像與資料)/iu.test(item.text));
    const readingOrder = markWorkTitles(isCreditsPage
      ? pageFlow
      : normaliseArtistSongIdentity(pageFlow, language));
    if (pageIndex > 0 && !coverSummary) {
      const firstParagraph = readingOrder.find((item) => (
        ['web-intro', 'web-body'].includes(readingClass(item)) && item.text.length >= 80
      ));
      coverSummary = firstParagraph ? truncateSummary(firstParagraph.text) : '';
    }
    const media = mediaByPage.get(pageIndex + 1) || [];
    sections.push(`<section class="web-section" data-pdf-page="${pageIndex + 1}">${renderEditorialSection(readingOrder, media, pageIndex, language)}</section>`);
  }
  return {
    edition: sections.length ? `<article class="web-edition">${sections.join('\n')}</article>\n` : null,
    text: textParts.join(' '),
    coverSummary,
    contents: contents.map(({ number, title, page }) => ({ number, title, page })).filter((entry) => entry.page)
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
  let coverSummary = '';

  for (const language of ['en', 'zh']) {
    const files = group.files[language];
    if (!files.pdf && !files.html) continue;
    let web = null;
    let contents = [];
    let visuals = { cover: null, mediaByPage: new Map(), pdfPages: [] };
    if (files.pdf) {
      const sourcePdf = path.join(issueFolder, language, files.pdf);
      try {
        visuals = await createPdfVisuals({ sourcePdf, id, language });
        covers[language] = visuals.cover;
      } catch (error) {
        console.warn(`Could not create PDF visuals for ${id} (${language}): ${error.message}`);
      }
      try {
        const conversion = await buildReadingEdition(sourcePdf, language, visuals.mediaByPage);
        sourceText += ` ${conversion.text}`;
        if (conversion.coverSummary && (!coverSummary || language === 'en')) coverSummary = conversion.coverSummary;
        contents = conversion.contents;
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
      web,
      pdfPages: visuals.pdfPages,
      contents
    };
  }

  const metadata = issueMetadata(titleFromSlug(slug), sourceText, coverSummary);

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

