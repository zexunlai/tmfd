import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, '_site');
const publishable = ['index.html', 'assets', 'archive', 'issues'];

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

const htmlNames = new Set(filenames.filter((name) => name.endsWith('.html')));
const pdfNames = new Set(filenames.filter((name) => name.endsWith('.pdf')));
const issues = [...htmlNames]
  .map((htmlName) => {
    const stem = htmlName.slice(0, -5);
    const match = stem.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if (!match || !pdfNames.has(`${stem}.pdf`)) return null;
    const [, date, slug] = match;
    return {
      date,
      dateLabel: formatDate(date),
      title: titleFromSlug(slug),
      html: `issues/${htmlName}`,
      pdf: `issues/${stem}.pdf`
    };
  })
  .filter(Boolean)
  .sort((a, b) => b.date.localeCompare(a.date));

await mkdir(path.join(destination, 'data'), { recursive: true });
await writeFile(path.join(destination, 'data', 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Built TMFD site with ${issues.length} published issue(s).`);

