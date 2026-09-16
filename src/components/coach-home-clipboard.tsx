'use client';

import { Fragment, useState } from 'react';
import { Check, ClipboardList, Calendar, BarChart3, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface RosterPlayer {
  num: string;
  name: string;
  hasVerse: boolean;
  present: boolean;
}

const ROSTER: RosterPlayer[] = [
  { num: '7', name: 'Marcus B.', hasVerse: true, present: true },
  { num: '12', name: 'Eli Ruiz', hasVerse: true, present: true },
  { num: '3', name: 'Jonah K.', hasVerse: true, present: true },
  { num: '21', name: 'Devin A.', hasVerse: false, present: false },
  { num: '5', name: 'Caleb M.', hasVerse: true, present: true },
  { num: '9', name: 'Sam Okafor', hasVerse: true, present: true },
  { num: '14', name: 'Tobias L.', hasVerse: true, present: false },
  { num: '2', name: 'Andre P.', hasVerse: false, present: false },
  { num: '18', name: 'Noah Vega', hasVerse: true, present: true },
  { num: '6', name: 'Levi Chen', hasVerse: true, present: true },
  { num: '11', name: 'Isaiah T.', hasVerse: false, present: false },
  { num: '8', name: 'Micah D.', hasVerse: true, present: true },
];

type RunOfDayItem =
  | { time: string; timeClassName?: string; kind: 'plain'; label: string }
  | { time: string; timeClassName?: string; kind: 'game'; title: string; tag: string }
  | { time: string; timeClassName?: string; kind: 'verse'; title: string; sub: string; tag: string };

const RUN_OF_DAY: RunOfDayItem[] = [
  { time: '9:45', kind: 'plain', label: 'Warm-up, Court 3' },
  { time: '10:30', timeClassName: 'text-cis-ember', kind: 'game', title: 'Lions vs. Eagles', tag: 'Game' },
  {
    time: '11:40',
    timeClassName: 'text-cis-sage-ink',
    kind: 'verse',
    title: 'Verse huddle',
    sub: 'Philippians 4:13',
    tag: '+3 pts',
  },
  { time: '12:15', kind: 'plain', label: 'Snack duty — Ruiz family' },
];

const NAV_ITEMS = [
  { key: 'today', label: 'Today', icon: ClipboardList },
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'standings', label: 'Standings', icon: BarChart3 },
  { key: 'team', label: 'Team', icon: Users },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]['key'];

export default function CoachHomeClipboard() {
  const [present, setPresent] = useState<boolean[]>(() => ROSTER.map((p) => p.present));
  const [activeTab, setActiveTab] = useState<NavKey>('today');

  const checkedCount = present.filter(Boolean).length;

  const togglePlayer = (index: number) => {
    setPresent((prev) => prev.map((value, i) => (i === index ? !value : value)));
  };

  return (
    <div className="flex min-h-screen justify-center bg-cis-page px-4 py-7 font-cis-body text-cis-ink">
      <div className="flex w-full max-w-[390px] flex-col overflow-hidden rounded-cis-shell bg-cis-board shadow-cis-shell">
        {/* Team header */}
        <div className="flex items-center justify-center gap-2.5 px-4 pt-4">
          <span className="h-[22px] w-[22px] rounded-full bg-cis-board-hole shadow-[inset_0_2px_3px_rgba(0,0,0,0.35)]" />
          <Badge className="rounded-cis-pill bg-cis-orange px-5 py-2 text-cis-sm font-extrabold text-cis-ink-dark shadow-[0_3px_0_var(--cis-orange-shadow)] hover:bg-cis-orange">
            Lions · 12U
          </Badge>
          <span className="h-[22px] w-[22px] rounded-full bg-cis-board-hole shadow-[inset_0_2px_3px_rgba(0,0,0,0.35)]" />
        </div>

        {/* Game day sheet */}
        <Card className="mx-3.5 mb-3.5 mt-2.5 rounded-cis-sheet border-0 bg-cis-paper-light p-0 text-cis-ink shadow-cis-sheet">
          <CardContent className="flex flex-col gap-0 p-cis-6 pt-6">
            <div className="flex items-start justify-between gap-3 pb-3">
              <div>
                <p className="font-cis-display text-cis-lg leading-none">Game day</p>
                <p className="mt-1 text-cis-base font-bold text-cis-ink-muted">Saturday, Oct 12</p>
              </div>
              <Badge
                variant="outline"
                className="-rotate-3 rounded-cis-chip border-[3px] border-double border-cis-ember px-3 py-2 text-cis-sm font-bold text-cis-ember"
              >
                Week 4 · home
              </Badge>
            </div>

            <div className="h-[5px] rounded-[3px] bg-cis-ink-dark" />

            <div className="flex items-end justify-between gap-3 border-b-2 border-dashed border-cis-rule-soft py-4">
              <div>
                <p className="font-cis-display text-cis-display-lg leading-none">Lions</p>
                <p className="my-1 text-cis-sm font-bold text-cis-ink-muted">vs.</p>
                <p className="font-cis-display text-cis-display-lg leading-none text-cis-ink-muted">Eagles</p>
              </div>
              <div className="text-right">
                <p className="font-cis-display text-cis-display-md leading-none text-cis-ember">10:30</p>
                <p className="mt-1 text-cis-sm font-bold">AM · Court 3</p>
                <p className="mt-0.5 text-cis-sm font-bold text-cis-ink-muted">tip-off in 1h 20m</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 py-4">
              <p className="font-cis-display text-cis-lg">Attendance</p>
              <p className="flex items-baseline gap-1.5">
                <span className="font-cis-display text-cis-display-md leading-none text-cis-orange-text">
                  {checkedCount}
                </span>
                <span className="text-cis-base font-extrabold text-cis-ink-muted">/ {ROSTER.length} present</span>
              </p>
            </div>

            <ul>
              {ROSTER.map((player, i) => {
                const here = present[i];
                return (
                  <li key={player.num}>
                    <button
                      type="button"
                      onClick={() => togglePlayer(i)}
                      className="flex min-h-[54px] w-full items-center gap-3 border-b border-cis-rule py-1.5 text-left transition-colors hover:bg-cis-apricot-tint/40"
                    >
                      <span className="w-[30px] text-right text-cis-base font-extrabold text-cis-ink-muted">
                        {player.num}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-cis-md font-bold',
                          here ? 'text-cis-ink' : 'text-cis-ink-muted'
                        )}
                      >
                        {player.name}
                      </span>
                      <span className="w-[34px] text-center text-cis-xs font-extrabold tracking-[0.1em] text-cis-sage-text">
                        {player.hasVerse ? '✓' : '—'}
                      </span>
                      <span
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-cis-box border-[3px] transition-transform active:scale-95',
                          here ? 'border-cis-orange bg-cis-orange' : 'border-cis-track bg-transparent'
                        )}
                      >
                        <Check
                          className={cn('h-6 w-6 stroke-[3.4] text-cis-paper-light', here ? 'opacity-100' : 'opacity-0')}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-2.5 pt-3 text-cis-sm font-bold text-cis-sage-text">
              <span>✓ column = verse recited</span>
              <span className="text-cis-ink-muted">tap a box to mark present</span>
            </div>

            <Button
              className="mt-4 min-h-[var(--cis-tap-primary)] rounded-cis-pill bg-cis-orange text-cis-lg font-extrabold tracking-[0.02em] text-cis-ink-dark shadow-cis-press hover:bg-cis-orange-hover hover:shadow-cis-press active:translate-y-[3px] active:bg-cis-orange-press active:shadow-[0_1px_0_var(--cis-orange-shadow)]"
            >
              Submit line-up
            </Button>
          </CardContent>
        </Card>

        {/* Run of day */}
        <Card className="mx-3.5 mb-3.5 rounded-cis-sheet border-0 bg-cis-paper p-0 text-cis-ink shadow-cis-sheet">
          <CardHeader className="p-cis-6 pb-3.5">
            <p className="font-cis-display text-cis-lg">Run of day</p>
          </CardHeader>
          <CardContent className="grid grid-cols-[62px_1fr] gap-x-3 px-cis-6 pb-0 pt-0 [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_55px,var(--cis-rule-soft)_55px,var(--cis-rule-soft)_56px)]">
            {RUN_OF_DAY.map((item) => (
              <Fragment key={item.time}>
                <div className={cn('flex h-14 items-center text-cis-base font-extrabold text-cis-ink-muted', item.timeClassName)}>
                  {item.time}
                </div>
                <div className="flex h-14 items-center justify-between gap-2">
                  {item.kind === 'plain' && <p className="text-cis-md font-bold">{item.label}</p>}
                  {item.kind === 'game' && (
                    <>
                      <p className="font-cis-display text-cis-lg">{item.title}</p>
                      <Badge className="rounded-cis-chip bg-cis-ember px-2.5 py-1.5 text-cis-sm font-bold text-cis-paper-light hover:bg-cis-ember">
                        {item.tag}
                      </Badge>
                    </>
                  )}
                  {item.kind === 'verse' && (
                    <>
                      <div>
                        <p className="text-cis-md font-bold text-cis-sage-ink">{item.title}</p>
                        <p className="text-cis-sm font-semibold text-cis-sage-text">{item.sub}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-cis-chip border-2 border-cis-sage px-2.5 py-1.5 text-cis-sm font-bold text-cis-sage-ink"
                      >
                        {item.tag}
                      </Badge>
                    </>
                  )}
                </div>
              </Fragment>
            ))}
          </CardContent>
          <CardContent className="flex gap-2.5 p-cis-6 pt-5">
            <Button
              variant="outline"
              className="min-h-[52px] flex-1 rounded-cis-pill border-[3px] border-cis-ink bg-transparent text-cis-base font-extrabold text-cis-ink hover:bg-cis-ink/5"
            >
              Log a verse
            </Button>
            <Button
              className="min-h-[52px] flex-1 rounded-cis-pill bg-cis-sage text-cis-base font-extrabold text-cis-paper-light shadow-[0_4px_0_var(--cis-sage-text)] hover:bg-cis-sage-hover hover:shadow-[0_4px_0_var(--cis-sage-text)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--cis-sage-text)]"
            >
              Psalm points
            </Button>
          </CardContent>
        </Card>

        {/* Bottom nav */}
        <nav className="flex items-center justify-between px-cis-6 pb-cis-6">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const active = key === activeTab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex min-h-[48px] min-w-[56px] flex-col items-center justify-center gap-1 text-cis-xs font-bold transition-colors',
                  active ? 'text-cis-apricot' : 'text-cis-ink-on-dark hover:text-cis-apricot'
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={2.75} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
