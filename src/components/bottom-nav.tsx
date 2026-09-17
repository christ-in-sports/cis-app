'use client';

import { usePathname, useRouter } from 'next/navigation';

export default function BottomNav({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const base = `/tournament/${tournamentId}`;

  const tabs = [
    { href: base, label: 'Hub', emoji: '🏠' },
    { href: `${base}/schedule`, label: 'Schedule', emoji: '📅' },
    { href: `${base}/overall`, label: 'Overall', emoji: '🏆' },
    { href: `${base}/members`, label: 'Members', emoji: '👥' },
  ];

  return (
    <>
      {/* Invisible spacer that takes up the same height as the nav */}
      <div className="h-20" />
      {/* The actual fixed nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-muted pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto flex">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || (tab.href !== base && pathname.startsWith(tab.href));
            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                className={`flex-1 flex flex-col items-center py-3 text-xs transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <span className="text-lg mb-0.5">{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}