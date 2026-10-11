import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, '_site');
const publishable = ['index.html', 'assets', 'archive', 'issues', 'read'];
const execFileAsync = promisify(execFile);

const titleFromSlug = (slug) => slug
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

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

// Converts a text-based PDF into a responsive reading edition. This is deliberately
// deterministic: it runs in GitHub Actions with Poppler and needs neither a key nor
// an external service. The PDF remains available as the layout-faithful original.
const buildReadingEdition = async (sourcePdf) => {
  const { stdout } = await execFileAsync('pdftohtml', [
    '-xml', '-stdout', '-hidden', sourcePdf
  ], { maxBuffer: 32 * 1024 * 1024 });

  const fontSizes = new Map(
    [...stdout.matchAll(/<fontspec\b([^>]*)\/>/g)].map(([, attrs]) => [
      attribute(attrs, 'id'), Number(attribute(attrs, 'size')) || 14
    ])
  );
  const sections = [];
  for (const [, pageAttrs, pageBody] of stdout.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const pageHeight = Number(attribute(pageAttrs, 'height')) || 1;
    const items = [];
    for (const [, textAttrs, rawText] of pageBody.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const text = decodeXml(rawText).replace(/\s+/g, ' ').trim();
      const top = Number(attribute(textAttrs, 'top'));
      if (!text || !Number.isFinite(top) || top < 95 || top > pageHeight * 0.91) continue;
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
      const isColumnRow = sorted.length > 1 && sorted.at(-1).left - sorted[0].left > 180;
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
        previous.item.text += ` ${item.text}`;
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
        const columns = block.rows[0].map((_, index) => block.rows
          .map((row) => renderReadingItem(row[index]))
          .concat(block.trailing[index].map(renderReadingItem))
          .join(''));
        return `<div class="web-columns">${columns.map((column) => `<div class="web-column">${column}</div>`).join('')}</div>`;
      }
      return `<div class="web-row">${renderReadingItem(block.item)}</div>`;
    }).join('\n');
    sections.push(`<section class="web-section">${content}</section>`);
  }
  return sections.length ? `<article class="web-edition">${sections.join('\n')}</article>\n` : null;
};

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of publishable) {
  await cp(path.join(root, name), path.join(destination, name), { recursive: true, force: true });
}

const issueFolder = path.join(root, 'issues');
let filenames = [];
try { filenames = await readdir(issueFolder); } catch (_) { /* First issue has not been added yet. */ }

const stems = new Set(
  filenames
    .filter((name) => name.endsWith('.html') || name.endsWith('.pdf'))
    .map((name) => name.replace(/\.(html|pdf)$/, ''))
);
const issues = [];
for (const stem of stems) {
  const match = stem.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!match) continue;

  const [, date, slug] = match;
  const hasHtml = filenames.includes(`${stem}.html`);
  const hasPdf = filenames.includes(`${stem}.pdf`);
  let web = null;

  if (hasPdf) {
    try {
      const edition = await buildReadingEdition(path.join(issueFolder, `${stem}.pdf`));
      if (edition) {
        const folder = path.join(destination, 'reader-content');
        await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, `${stem}.html`), edition);
        web = `reader-content/${stem}.html`;
      }
    } catch (error) {
      console.warn(`Could not make a responsive reading edition for ${stem}: ${error.message}`);
    }
  }

  issues.push({
    id: stem,
    date,
    dateLabel: formatDate(date),
    title: titleFromSlug(slug),
    html: hasHtml ? `issues/${stem}.html` : null,
    pdf: hasPdf ? `issues/${stem}.pdf` : null,
    web
  });
}
issues.sort((a, b) => b.date.localeCompare(a.date));

await mkdir(path.join(destination, 'data'), { recursive: true });
await writeFile(path.join(destination, 'data', 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Built TMFD site with ${issues.length} published issue(s).`);

