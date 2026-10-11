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
    document.getElementById('current-description').textContent = current.excerpt || current.category;
    const tags = document.getElementById('current-tags');
    tags.replaceChildren(...[current.category, ...(current.tags || [])].map((label) => {
      const tag = document.createElement('span');
      tag.className = 'issue-tag';
      tag.textContent = label;
      return tag;
    }));
    const read = document.getElementById('read-current');
    const download = document.getElementById('download-current');
    read.href = `read/?issue=${encodeURIComponent(current.id)}`;
    read.textContent = 'Read online';
    read.target = '';

    if (current.pdf) {
      download.href = current.pdf;
      download.textContent = 'Open PDF';
      download.target = '_blank';
      download.rel = 'noopener';
      download.hidden = false;
    } else {
      download.hidden = true;
    }
    document.getElementById('current-actions').hidden = false;
  } catch (_) {
    document.getElementById('current-title').textContent = 'The first issue is coming soon.';
  }
})();

