(async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const title = document.getElementById('issue-title');
  const date = document.getElementById('issue-date');
  const content = document.getElementById('reader-content');
  const openPdf = document.getElementById('open-pdf');
  const issueId = new URLSearchParams(window.location.search).get('issue');

  try {
    const response = await fetch('../data/issues.json');
    if (!response.ok) throw new Error('Issue index unavailable');
    const issues = await response.json();
    const issue = issues.find((entry) => entry.id === issueId);
    if (!issue) throw new Error('Issue not found');

    title.textContent = issue.title;
    date.textContent = issue.dateLabel;
    if (issue.pages?.length) {
      const pages = document.createElement('div');
      pages.className = 'issue-pages';
      for (const [index, source] of issue.pages.entries()) {
        const page = document.createElement('img');
        page.className = 'issue-page';
        page.src = `../${source}`;
        page.alt = `${issue.title}, page ${index + 1}`;
        pages.append(page);
      }
      content.append(pages);
    } else if (issue.html) {
      const frame = document.createElement('iframe');
      frame.className = 'issue-reader';
      frame.src = `../${issue.html}`;
      frame.title = `${issue.title} — TMFD`;
      content.append(frame);
    } else {
      throw new Error('Issue has no readable source');
    }

    if (issue.pdf) {
      openPdf.href = `../${issue.pdf}`;
      openPdf.hidden = false;
    }
  } catch (_) {
    title.textContent = 'Issue unavailable';
    content.replaceChildren();
    const message = document.createElement('p');
    message.className = 'reader-fallback';
    message.textContent = 'This issue could not be found. Please return to the archive and try again.';
    content.append(message);
  }
})();
