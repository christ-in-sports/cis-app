import type { MetadataRoute } from 'next';

// Colours are literal values from design/tokens.css: --cis-page for the
// splash and browser chrome (matches viewport.themeColor in layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Christ in Sports',
    short_name: 'CIS',
    description: 'Manage your CIS season',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#E9DCC6',
    theme_color: '#E9DCC6',
    icons: [
      { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
