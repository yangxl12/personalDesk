try {
  document.documentElement.dataset.theme = localStorage.getItem('buxu.theme') === 'dark' ? 'dark' : 'light';
} catch {}
