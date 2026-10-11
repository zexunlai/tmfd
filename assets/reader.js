(async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const title = document.getElementById('issue-title');
  const date = document.getElementById('issue-date');
  const content = document.getElementById('reader-content');
  const actions = document.getElementById('reader-actions');
  const issueId = new URLSearchParams(window.location.search).get('issue');
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');

  try {
    const response = await fetch('../data/issues.json');
    if (!response.ok) throw new Error('Issue index unavailable');
    const issues = await response.json();
    const issue = issues.find((entry) => entry.id === issueId);
    if (!issue) throw new Error('Issue not found');
    const language = issue.languages?.[requestedLanguage] ? requestedLanguage : (issue.languages?.en ? 'en' : 'zh');
    const edition = issue.languages?.[language];
    if (!edition) throw new Error('Language edition not found');

    title.textContent = issue.title;
    date.textContent = `${issue.dateLabel} · ${language === 'zh' ? '中文' : 'English'}`;
    if (edition.web) {
      const response = await fetch(`../${edition.web}`);
      if (!response.ok) throw new Error('Reading edition unavailable');
      // The fragment is generated during the local/GitHub build from escaped PDF text.
      content.innerHTML = await response.text();
    } else if (edition.html) {
      const frame = document.createElement('iframe');
      frame.className = 'issue-reader';
      frame.src = `../${edition.html}`;
      frame.title = `${issue.title} — TMFD`;
      content.append(frame);
    } else {
      throw new Error('Issue has no readable source');
    }

    const configure = (id, code, label, pdf = false) => {
      const link = document.getElementById(id);
      const alternative = issue.languages?.[code];
      if (!alternative || !(pdf ? alternative.pdf : (alternative.web || alternative.html))) return;
      link.classList.remove('is-current');
      link.removeAttribute('aria-current');
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
      if (!pdf && code === language) {
        link.removeAttribute('href');
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
        link.setAttribute('aria-disabled', 'true');
        link.tabIndex = -1;
      } else {
        link.href = pdf ? `../${alternative.pdf}` : `?issue=${encodeURIComponent(issue.id)}&lang=${code}`;
      }
      link.textContent = label;
      link.hidden = false;
    };
    configure('read-online-en', 'en', 'Read online');
    configure('read-online-zh', 'zh', 'Read online in Chinese');
    configure('open-pdf-en', 'en', 'Open PDF', true);
    configure('open-pdf-zh', 'zh', 'Open PDF (Chinese)', true);
    actions.hidden = false;

    // The publication identity always has a full line. The compact reading
    // choices belong beside the article's own cover-line and title information.
    const firstHeadingRow = content.querySelector('.web-heading')?.closest('.web-row');
    if (firstHeadingRow) {
      const section = firstHeadingRow.closest('.web-section');
      const identity = firstHeadingRow.closest('.web-stack') || firstHeadingRow;
      const articleRows = [...section.children].filter((child) => child !== identity);
      if (articleRows.length) {
        identity.classList.add('edition-identity');
        const displayIndex = articleRows.findIndex((row) => row.querySelector('.web-display'));
        const titleRows = displayIndex >= 0 ? articleRows.slice(0, displayIndex + 1) : [];
        const informationRows = displayIndex >= 0 ? articleRows.slice(displayIndex + 1) : articleRows;
        identity.after(...titleRows);
        if (!informationRows.length) return;
        const intro = document.createElement('div');
        intro.className = 'article-intro';
        const information = document.createElement('div');
        information.className = 'article-intro-information';
        information.append(...informationRows);
        (titleRows.at(-1) || identity).after(intro);
        intro.append(information, actions);
      }
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
