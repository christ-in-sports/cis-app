export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'cis-theme';

// Runs in the head before the page paints. Only the root class changes before hydration.
export const themeScript = `(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('${THEME_KEY}') || 'system'; } catch {}
  const dark = preference === 'dark' || (preference !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();`;
