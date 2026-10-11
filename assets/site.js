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
    document.getElementById('current-description').textContent = current.dateLabel;
    const read = document.getElementById('read-current');
    const download = document.getElementById('download-current');
    read.href = current.html || current.pdf;
    read.textContent = current.html ? 'Read online' : 'Open PDF';
    read.target = current.html ? '' : '_blank';

    if (current.pdf) {
      download.href = current.pdf;
      download.download = '';
      download.hidden = false;
    } else {
      download.hidden = true;
    }
    document.getElementById('current-actions').hidden = false;
  } catch (_) {
    document.getElementById('current-title').textContent = 'The first issue is coming soon.';
  }
})();

