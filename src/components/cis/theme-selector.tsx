'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_KEY, type ThemePreference } from '@/lib/theme';

let temporaryPreference: ThemePreference | null = null;

function getPreference(): ThemePreference {
  if (temporaryPreference) return temporaryPreference;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function isDark(): boolean {
  const preference = getPreference();
  return preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('storage', callback);
  window.addEventListener('cis-theme-change', callback);
  media.addEventListener('change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('cis-theme-change', callback);
    media.removeEventListener('change', callback);
  };
}

export function ThemeSelector() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  useEffect(() => {
    // Read the browser value here so hydration never briefly undoes the head script.
    const resolved = isDark();
    document.documentElement.classList.toggle('dark', resolved);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved ? '#141B21' : '#F5F1E8');
  }, [dark]);

  return (
    <div className="cis-focus-scope mx-auto flex w-full max-w-[560px] items-center justify-end gap-3 px-6 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] print:hidden">
      <span id="app-theme-label" className="text-cis-sm font-bold text-cis-ink-muted">Appearance</span>
      <button
        type="button"
        role="switch"
        aria-describedby="app-theme-label"
        aria-checked={dark}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="relative flex h-12 w-[86px] items-center rounded-cis-pill bg-cis-chrome-tab px-2 text-cis-action dark:bg-cis-chrome-tab dark:text-cis-ink"
        onClick={() => {
          temporaryPreference = isDark() ? 'light' : 'dark';
          try {
            localStorage.setItem(THEME_KEY, temporaryPreference);
            temporaryPreference = null;
          } catch { /* Keep this session usable without storage. */ }
          window.dispatchEvent(new Event('cis-theme-change'));
        }}
      >
        <Sun size={19} strokeWidth={2.75} aria-hidden="true" className="absolute right-3 dark:hidden" />
        <Moon size={19} strokeWidth={2.75} aria-hidden="true" className="absolute left-3 hidden dark:block" />
        <span aria-hidden="true" className="absolute left-1.5 h-9 w-9 rounded-full bg-cis-paper-light shadow-cis-sheet dark:left-auto dark:right-1.5 dark:bg-cis-ink-on-dark" />
      </button>
    </div>
  );
}
