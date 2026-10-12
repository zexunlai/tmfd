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
    const editionLabel = current.editionLabel ? ` · ${current.editionLabel}` : '';
    document.getElementById('current-date').textContent = `${current.dateLabel.toUpperCase()}${editionLabel}`;
    document.getElementById('current-description').textContent = current.excerpt || current.genres?.join(', ') || '';
    const genres = document.getElementById('current-genres');
    genres.replaceChildren(...(current.genres || []).map((label) => {
      const genre = document.createElement('span');
      genre.className = 'issue-genre';
      genre.textContent = label;
      return genre;
    }));
    const language = current.languages?.en ? 'en' : 'zh';
    const edition = current.languages?.[language];
    if (edition?.web || edition?.html) {
      const read = document.getElementById('read-current-en');
      read.href = `read/?issue=${encodeURIComponent(current.id)}&lang=${language}`;
      read.hidden = false;
      document.getElementById('current-actions').hidden = false;
      if (current.cover) {
        const cover = document.getElementById('current-cover');
        cover.href = read.href;
        const image = document.getElementById('current-cover-image');
        image.src = current.cover;
        image.alt = `${current.title} cover artwork`;
        cover.hidden = false;
      }
    }
  } catch (_) {
    document.getElementById('current-title').textContent = 'The first issue is coming soon.';
  }
})();

