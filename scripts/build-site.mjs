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
  const pages = [];

  if (hasPdf) {
    const outputFolder = path.join(destination, 'reader-assets', stem);
    await mkdir(outputFolder, { recursive: true });
    await execFileAsync('pdftoppm', [
      '-png', '-r', '144', path.join(issueFolder, `${stem}.pdf`), path.join(outputFolder, 'page')
    ]);
    const pageFiles = (await readdir(outputFolder))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    pages.push(...pageFiles.map((name) => `reader-assets/${stem}/${name}`));
  }

  issues.push({
    id: stem,
    date,
    dateLabel: formatDate(date),
    title: titleFromSlug(slug),
    html: hasHtml ? `issues/${stem}.html` : null,
    pdf: hasPdf ? `issues/${stem}.pdf` : null,
    pages
  });
}
issues.sort((a, b) => b.date.localeCompare(a.date));

await mkdir(path.join(destination, 'data'), { recursive: true });
await writeFile(path.join(destination, 'data', 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Built TMFD site with ${issues.length} published issue(s).`);

