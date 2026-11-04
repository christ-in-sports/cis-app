'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { THEME_KEY, type ThemePreference } from '@/lib/theme';
import { SelectInput } from '@/components/cis/form';

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

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('cis-theme-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('cis-theme-change', callback);
  };
}

export function ThemeSelector() {
  const preference = useSyncExternalStore(subscribe, getPreference, () => 'system');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const current = getPreference();
      const dark = current === 'dark' || (current === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141B21' : '#F5F1E8');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  return (
    <div className="cis-focus-scope mx-auto flex w-full max-w-[560px] items-center justify-end gap-3 px-6 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] print:hidden">
      <label htmlFor="app-theme" className="text-cis-sm font-bold text-cis-ink-muted">Appearance</label>
      <SelectInput
        id="app-theme"
        className="w-auto"
        value={preference}
        onChange={(event) => {
          temporaryPreference = event.target.value as ThemePreference;
          try {
            localStorage.setItem(THEME_KEY, temporaryPreference);
            temporaryPreference = null;
          } catch { /* Keep this session usable without storage. */ }
          window.dispatchEvent(new Event('cis-theme-change'));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </SelectInput>
    </div>
  );
}
