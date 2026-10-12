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

const issueMetadata = (title, sourceText) => {
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
  // The web edition deliberately has only five editorial type scales:
  // 32 / 20 / 16 / 14 / 10 pt.  PDF point sizes are used only to identify
  // their role; CSS applies the controlled TMFD web scale.
  if (role === 'section-label' || role === 'credit') return 'web-meta';
  if (role === 'work') return 'web-work';
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

const renderReadingItem = (item) => {
  const className = readingClass(item);
  const tag = readingTag(className);
  const text = escapeHtml(item.text);
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
const isExternalHref = (href) => /^(?:https?:\/\/|mailto:)/iu.test(href);
const linkFromPdfText = (rawText) => {
  const href = decodeXml(attribute(rawText, 'href'));
  return isExternalHref(href) ? href : '';
};
const isInternalPdfLink = (rawText) => Boolean(attribute(rawText, 'href')) && !linkFromPdfText(rawText);
const internalPdfPage = (href) => Number((href.match(/#(\d+)$/) || [])[1]) || null;
const isDateLine = (text) => /(?:\b(?:19|20)\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d{1,2}\s*月)/iu.test(text);
const markWorkTitles = (items) => items.map((item, index, list) => {
  if (readingClass(item) !== 'web-secondary') return item;
  const next = list[index + 1];
  if (/\b(?:19|20)\d{2}\b/u.test(item.text) || (next && isDateLine(next.text))) {
    return { ...item, role: 'work' };
  }
  return item;
});

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

// PDF pages do not retain a useful article-level image anchor.  Keep each
// image with its original PDF page, but distribute the source page's reading
// flow around it in alternating editorial pairs instead of placing all visual
// material at the end of the text.
const renderEditorialSection = (items, media, pageIndex) => {
  const isBlockHeading = (item) => ['web-section-title', 'web-secondary', 'web-work'].includes(readingClass(item));
  const rows = (entries) => entries.map((item) => (
    `<div class="web-row${isBlockHeading(item) ? ' web-row--heading' : ''}">${renderReadingItem(item)}</div>`
  )).join('\n');
  if (!media.length) return rows(items);

  // A print page can contain several discrete stories. Split before every
  // editorial heading, so a band/album heading is always a full-width start
  // to its own block rather than text squeezed beside an earlier photograph.
  const blocks = [];
  for (const item of items) {
    if (isBlockHeading(item) && blocks.at(-1)?.length) blocks.push([]);
    if (!blocks.length) blocks.push([]);
    blocks.at(-1).push(item);
  }
  const visualsByBlock = blocks.map(() => []);
  const storyBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.some((item) => readingClass(item) === 'web-work'))
    .map(({ index }) => index);
  const visualTargets = storyBlocks.length ? storyBlocks : blocks.map((_, index) => index);
  media.forEach((image, index) => {
    // Images normally sit between complete editorial blocks rather than before
    // the first one. Place each visual at its proportional reading position,
    // so a single photograph on a page with two stories belongs to the second
    // story instead of arbitrarily attaching to the first.
    const target = visualTargets[Math.min(visualTargets.length - 1, Math.floor((index + 1) * visualTargets.length / (media.length + 1)))];
    visualsByBlock[target].push(image);
  });
  // Never create a visual card that contains only a heading and an image.
  // If a print spread uses a decorative section opener, carry the image to the
  // next complete prose block so there is always real text to wrap around it.
  const hasProse = (block) => block.some((item) => ['web-intro', 'web-body'].includes(readingClass(item)));
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
    if (!visuals.length) return rows(block);
    let leadCount = 0;
    while (leadCount < block.length && (isBlockHeading(block[leadCount]) || readingClass(block[leadCount]) === 'web-meta')) leadCount += 1;
    const heading = block.slice(0, leadCount);
    const copy = block.slice(leadCount);
    const chunkSize = Math.max(1, Math.ceil(copy.length / visuals.length));
    return visuals.map((image, index) => {
      const prose = copy.slice(index * chunkSize, (index + 1) * chunkSize);
      const reverse = (pageIndex + visualIndex++) % 2 === 1;
      return `<div class="web-feature${reverse ? ' web-feature--reverse' : ''}">${index === 0 && heading.length ? `<div class="web-feature-heading">${rows(heading)}</div>` : ''}${renderMedia(image)}<div class="web-feature-copy">${rows(prose)}</div></div>`;
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
    const items = [];
    for (const [, textAttrs, rawText] of rawTextElements) {
      const text = decodeXml(rawText).replace(/\s+/g, ' ').trim();
      const top = Number(attribute(textAttrs, 'top'));
      const font = fontSpecs.get(attribute(textAttrs, 'font')) || { size: 14, family: '' };
      if (!text || !Number.isFinite(top) || top > pageHeight * 0.88 || isPageNumber(text)) continue;
      const item = {
        text,
        top,
        left: Number(attribute(textAttrs, 'left')) || 0,
        size: font.size,
        family: font.family,
        href: linkFromPdfText(rawText)
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
    const readingOrder = markWorkTitles(pageReadingFlow(items, pageWidth)
      .filter((item) => !isContinuationLabel(item)));
    const media = mediaByPage.get(pageIndex + 1) || [];
    sections.push(`<section class="web-section" data-pdf-page="${pageIndex + 1}">${renderEditorialSection(readingOrder, media, pageIndex)}</section>`);
  }
  return {
    edition: sections.length ? `<article class="web-edition">${sections.join('\n')}</article>\n` : null,
    text: textParts.join(' '),
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

  for (const language of ['en', 'zh']) {
    const files = group.files[language];
    if (!files.pdf && !files.html) continue;
    let web = null;
    let contents = [];
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
      contents
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

