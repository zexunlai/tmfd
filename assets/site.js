(async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  try {
    const response = await fetch('data/issues.json');
    if (!response.ok) throw new Error('Issue index unavailable');
    const issues = await response.json();
    const current = issues[0];
    if (!current) return;

    document.getElementById('current-title').textContent = current.title;
    document.getElementById('current-date').textContent = current.dateLabel;
    document.getElementById('current-description').textContent = current.excerpt || current.genres?.join(', ') || '';
    const genres = document.getElementById('current-genres');
    genres.replaceChildren(...(current.genres || []).map((label) => {
      const genre = document.createElement('span');
      genre.className = 'issue-genre';
      genre.textContent = label;
      return genre;
    }));
    const configure = (id, language, label, pdf = false) => {
      const link = document.getElementById(id);
      const edition = current.languages?.[language];
      if (!edition || !(pdf ? edition.pdf : (edition.web || edition.html))) return;
      link.href = pdf ? edition.pdf : `read/?issue=${encodeURIComponent(current.id)}&lang=${language}`;
      link.textContent = label;
      link.hidden = false;
    };
    configure('read-current-en', 'en', 'Read online');
    configure('read-current-zh', 'zh', 'Read online (中文)');
    configure('open-current-en', 'en', 'Open PDF', true);
    configure('open-current-zh', 'zh', 'Open PDF (中文)', true);
    document.getElementById('current-actions').hidden = false;
  } catch (_) {
    document.getElementById('current-title').textContent = 'The first issue is coming soon.';
  }
})();

