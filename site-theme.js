(() => {
  const root = document.documentElement;
  try {
    const theme = localStorage.getItem('oge-theme');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  } catch {}
  root.dataset.theme ||= 'light';
})();
