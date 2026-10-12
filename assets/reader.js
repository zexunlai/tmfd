(async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const title = document.getElementById('issue-title');
  const date = document.getElementById('issue-date');
  const content = document.getElementById('reader-content');
  const navigation = document.getElementById('reader-navigation');
  const actions = document.getElementById('reader-actions');
  const backToTop = document.getElementById('back-to-top');
  const issueId = new URLSearchParams(window.location.search).get('issue');
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');

  const updateBackToTop = () => { backToTop.hidden = window.scrollY < 360; };
  backToTop.addEventListener('click', () => window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  }));
  window.addEventListener('scroll', updateBackToTop, { passive: true });
  updateBackToTop();

  try {
    const response = await fetch('../data/issues.json');
    if (!response.ok) throw new Error('Issue index unavailable');
    const issues = await response.json();
    const issue = issues.find((entry) => entry.id === issueId);
    if (!issue) throw new Error('Issue not found');
    const language = issue.languages?.[requestedLanguage] ? requestedLanguage : (issue.languages?.en ? 'en' : 'zh');
    const edition = issue.languages?.[language];
    if (!edition) throw new Error('Language edition not found');

    document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
    content.dataset.language = language;

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

    const coverSource = issue.covers?.[language] || issue.cover;
    if (coverSource) {
      const cover = document.createElement('figure');
      cover.className = 'reader-cover';
      const image = document.createElement('img');
      image.src = `../${coverSource}`;
      image.alt = `${issue.title} cover artwork`;
      cover.append(image);
      const firstSection = content.querySelector('.web-section');
      if (firstSection) firstSection.after(cover);
    }

    const buildContents = () => {
      // The PDF's own numbered contents page is the source of truth. Do not
      // infer a contents list from dates, artist names, or running headers.
      const sourceContents = issue.languages?.[language]?.contents || [];
      const entries = sourceContents.flatMap(({ number, title: entryTitle, page }) => {
        const section = content.querySelector(`[data-pdf-page="${page}"]`);
        if (!section || !entryTitle) return [];
        section.id = `section-${number}`;
        return [{ section, text: `${number} ${entryTitle}` }];
      });
      if (!entries.length) return;
      navigation.replaceChildren();
      const title = document.createElement('p');
      title.className = 'reader-navigation-title';
      title.textContent = 'Contents';
      const list = document.createElement('div');
      list.className = 'reader-navigation-list';
      entries.forEach(({ section, text }) => {
        const link = document.createElement('a');
        link.href = `#${section.id}`;
        link.textContent = text;
        list.append(link);
      });
      navigation.append(title, list);
      navigation.hidden = false;
    };
    buildContents();

    const showPdf = (pdf, label) => {
      let viewer = content.querySelector('.reader-pdf-cover');
      if (!viewer) {
        viewer = document.createElement('section');
        viewer.className = 'reader-pdf-cover';
        const frame = document.createElement('iframe');
        frame.className = 'reader-pdf-cover-frame';
        viewer.append(frame);
        const cover = content.querySelector('.reader-cover');
        if (cover) cover.replaceWith(viewer);
        else content.prepend(viewer);
      }
      const frame = viewer.querySelector('.reader-pdf-cover-frame');
      frame.title = `${issue.title} — ${label}`;
      frame.src = `../${pdf}#view=FitH`;
      viewer.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    };

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
        if (pdf) {
          link.addEventListener('click', (event) => {
            event.preventDefault();
            showPdf(alternative.pdf, label);
          });
        }
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
    const firstHeadingRow = content.querySelector('.web-secondary')?.closest('.web-row');
    if (firstHeadingRow) {
      const section = firstHeadingRow.closest('.web-section');
      const identity = firstHeadingRow.closest('.web-stack') || firstHeadingRow;
      const articleRows = [...section.children].filter((child) => child !== identity);
      if (articleRows.length) {
        identity.classList.add('edition-identity');
        const displayIndex = articleRows.findIndex((row) => row.querySelector('.web-section-title'));
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
    content.classList.add('is-ready');
    requestAnimationFrame(() => actions.classList.add('is-ready'));
  } catch (_) {
    title.textContent = 'Issue unavailable';
    content.replaceChildren();
    const message = document.createElement('p');
    message.className = 'reader-fallback';
    message.textContent = 'This issue could not be found. Please return to the archive and try again.';
    content.append(message);
  }
})();
