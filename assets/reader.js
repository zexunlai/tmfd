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
    const source = issue.html || issue.pdf;
    const frame = document.createElement('iframe');
    frame.className = 'issue-reader';
    frame.src = `../${source}`;
    frame.title = `${issue.title} — TMFD`;
    content.append(frame);

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
