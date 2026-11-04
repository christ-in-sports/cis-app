import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeSelector } from '@/components/cis/theme-selector';
import { themeScript } from '@/lib/theme';
import { Toaster } from '@/components/ui/toaster';
import { caprasimo, figtree } from '@/lib/fonts';

export const metadata: Metadata = {
  title: 'Christ in Sports',
  description: 'Manage your CIS season',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CIS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F5F1E8',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${caprasimo.variable} ${figtree.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen bg-background font-cis-body text-foreground">
        <ThemeSelector />
        <Toaster>
          {children}
        </Toaster>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}