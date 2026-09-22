'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  type Season, type SummaryRow, type Division, type MinistryTeam,
} from '@/lib/attendance';

type SortKey = 'attended' | 'pct' | 'name';

export default function SummaryClient({
  isStaff, seasons: initialSeasons, initialSeasonId, initialRows, initialDayCount, teams,
}: {
  isStaff: boolean;
  seasons: Season[];
  initialSeasonId: string | null;
  initialRows: SummaryRow[];
  initialDayCount: number;
  teams: MinistryTeam[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [seasons, setSeasons] = useState(initialSeasons);
  const [seasonId, setSeasonId] = useState(initialSeasonId);
  const [rows, setRows] = useState(initialRows);
  const [dayCount, setDayCount] = useState(initialDayCount);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  // Division is NOT NULL on registrations, so there is no longer a "none" case.
  const [sessionFilter, setSessionFilter] = useState<'all' | Division>('all');
  const [teamFilter, setTeamFilter] = useState<'all' | string>('all');
  const [sort, setSort] = useState<SortKey>('attended');

  // Rollover modal
  const [showRollover, setShowRollover] = useState(false);
  const [newSeason, setNewSeason] = useState('');
  const [armed, setArmed] = useState(false);   // second-stage confirm
  const [busy, setBusy] = useState(false);

  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const currentSeason = seasons.find((s) => s.is_current) ?? null;

  /** Suggest the next span, e.g. 2025–26 -> 2026–27. */
  const suggestedName = useMemo(() => {
    const m = currentSeason?.name.match(/(\d{4})\s*[–-]\s*(\d{2,4})/);
    if (!m) return '';
    const start = parseInt(m[1], 10) + 1;
    return `${start}–${String(start + 1).slice(-2)}`;
  }, [currentSeason]);

  const openRollover = () => {
    setNewSeason(suggestedName);
    setArmed(false);
    setShowRollover(true);
  };

  const closeRollover = () => {
    setShowRollover(false);
    setArmed(false);
    setNewSeason('');
  };

  // Escape closes the modal
  useEffect(() => {
    if (!showRollover) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRollover(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRollover]);

  const loadSeason = async (id: string) => {
    setSeasonId(id);
    setLoading(true);

    const [{ data: r, error }, { data: d }] = await Promise.all([
      supabase.rpc('attendance_summary', { p_season: id }),
      supabase.from('attendance_days').select('id').eq('season_id', id),
    ]);

    if (error) toast({ title: 'Could not load', description: error.message, variant: 'destructive' });
    else setRows(r ?? []);
    setDayCount((d ?? []).length);
    setLoading(false);
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if ((sessionFilter === 'juniors' || sessionFilter === 'ambassadors')
          && r.division !== sessionFilter) return false;
      if (teamFilter !== 'all') {
        if (teamFilter === 'noteam' ? !!r.team_id : r.team_id !== teamFilter) return false;
      }
      if (!q) return true;
      return `${r.first_name} ${r.last_name}`.toLowerCase().includes(q);
    });

    return [...list].sort((a, b) => {
      if (sort === 'name')
        return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
      if (sort === 'pct')
        return b.pct - a.pct || b.attended - a.attended;
      return b.attended - a.attended || b.pct - a.pct || a.last_name.localeCompare(b.last_name);
    });
  }, [rows, search, sessionFilter, teamFilter, sort]);

  const totals = useMemo(() => {
    const attended = shown.reduce((n, r) => n + r.attended, 0);
    const eligible = shown.reduce((n, r) => n + r.eligible, 0);
    const perfect = shown.filter((r) => r.eligible > 0 && r.pct === 100).length;
    const zero = shown.filter((r) => r.attended === 0).length;
    return {
      avg: eligible ? Math.round((attended / eligible) * 1000) / 10 : 0,
      perfect,
      zero,
    };
  }, [shown]);

  const rollover = async () => {
    const name = newSeason.trim();
    if (!name) return;

    setBusy(true);
    const { data: id, error } = await supabase.rpc('start_new_season', { p_name: name });
    setBusy(false);

    if (error) {
      setArmed(false);
      return toast({ title: 'Rollover failed', description: error.message, variant: 'destructive' });
    }

    toast({ title: `${name} is now active`, description: 'Counters start fresh.' });
    closeRollover();
    router.refresh();

    if (id) {
      const { data: s } = await supabase
        .from('seasons').select('*').order('starts_on', { ascending: false });
      setSeasons(s ?? []);
      loadSeason(id as string);
    }
  };

  const exportCsv = () => {
    const csv = Papa.unparse({
      fields: ['Rank','First','Last','Grade','Division','Team','Attended','Late','Absent','Excused','Days','Percent'],
      data: shown.map((r, i) => [
        i + 1, r.first_name, r.last_name, r.grade, r.division,
        r.team_name ?? '', r.attended, r.late, r.absent, r.excused, r.eligible, r.pct,
      ]),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${season?.name ?? 'season'}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  };

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted">
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <Button variant="ghost" size="sm" className="-ml-2"
                  onClick={() => router.push('/attendance')}>
            ← Attendance
          </Button>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold">📊 Attendance Summary</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {dayCount} day{dayCount === 1 ? '' : 's'}
                </span>
                {season && (
                  <Badge className={`text-xs ${
                    season.is_current
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    {season.is_current ? 'Active season' : 'Archived'}
                  </Badge>
                )}
              </div>
            </div>

            {isStaff && (
              <Button
                onClick={openRollover}
                className="h-11 px-4 flex-shrink-0 bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25"
              >
                🔄 New Season
              </Button>
            )}
          </div>

          {/* Season picker: pills when few, dropdown when many */}
          {seasons.length > 1 && seasons.length <= 4 ? (
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {seasons.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSeason(s.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm transition-colors ${
                    s.id === seasonId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {s.name}{s.is_current && ' •'}
                </button>
              ))}
            </div>
          ) : seasons.length > 4 ? (
            <select
              value={seasonId ?? ''}
              onChange={(e) => loadSeason(e.target.value)}
              className="w-full h-11 rounded-lg border border-input bg-background px-3 text-base"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.is_current ? ' (current)' : ''}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* ── Stats ────────────────────────────────────────── */}
        {shown.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {([
              ['Avg turnout', `${totals.avg}%`, 'text-primary'],
              ['Perfect', String(totals.perfect), 'text-green-400'],
              ['Never came', String(totals.zero), 'text-red-400'],
            ] as [string, string, string][]).map(([label, value, tone]) => (
              <Card key={label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-xl font-bold ${tone}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────── */}
        <div className="flex gap-2">
          <Input placeholder="Search a kid…" value={search}
                 onChange={(e) => setSearch(e.target.value)} className="h-12 text-base" />
          <Button variant="outline" className="h-12 px-4" onClick={exportCsv}
                  disabled={shown.length === 0} title="Export CSV">
            ⬇️
          </Button>
        </div>

        <div className="flex gap-2">
          <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value as any)}
                  className="flex-1 h-12 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="all">All divisions</option>
            <option value="juniors">Juniors</option>
            <option value="ambassadors">Ambassadors</option>
          </select>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
                  className="flex-1 h-12 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="all">All teams</option>
            <option value="noteam">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          {([['attended','Most days'],['pct','Best %'],['name','A–Z']] as [SortKey,string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`flex-1 py-2.5 rounded-xl text-sm transition-colors ${
                sort === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Leaderboard ──────────────────────────────────── */}
        {loading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Loading…</CardContent></Card>
        ) : shown.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">Nothing to show</p>
              <p className="text-sm">
                {dayCount === 0
                  ? 'No attendance days in this season yet.'
                  : 'No kids match these filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {shown.map((r, i) => (
                <div key={r.registration_id}
                     className="flex items-center gap-3 px-4 py-3 border-b border-muted/30 last:border-0">
                  <span className="w-8 text-center text-sm font-bold text-muted-foreground flex-shrink-0">
                    {sort === 'name' ? i + 1 : medal(i)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {r.first_name} {r.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Grade {r.grade}
                      {` • ${r.division === 'juniors' ? 'Juniors' : 'Ambassadors'}`}
                      {r.team_name && ` • ${r.team_name}`}
                    </p>
                    {(r.late > 0 || r.excused > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {r.late > 0 && `${r.late} late`}
                        {r.late > 0 && r.excused > 0 && ' • '}
                        {r.excused > 0 && `${r.excused} excused`}
                      </p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold leading-tight">
                      {r.attended}
                      <span className="text-xs text-muted-foreground font-normal">/{r.eligible}</span>
                    </p>
                    <Badge className={`text-xs ${
                      r.pct >= 80 ? 'bg-green-500/20 text-green-400'
                      : r.pct >= 50 ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-red-500/20 text-red-400'}`}>
                      {r.pct}%
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Rollover modal ─────────────────────────────────── */}
      {showRollover && isStaff && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={closeRollover} />

          <div className="relative z-50 w-full max-w-md max-h-[88vh] overflow-auto rounded-t-2xl sm:rounded-2xl border border-amber-500/40 bg-background p-6 pb-28 sm:pb-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">🔄 Start New Season</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently active: {currentSeason?.name ?? 'none'}
                </p>
              </div>
              <button onClick={closeRollover} className="text-2xl leading-none p-1 -mt-1">✕</button>
            </div>

            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 mb-4 space-y-1.5">
              <p className="text-xs font-medium text-amber-300">What this does</p>
              {[
                `Archives ${currentSeason?.name ?? 'the current season'} and closes it`,
                "Resets every kid's attendance counter to 0",
                'Nothing is deleted — old seasons stay viewable above',
                'New attendance days join the new season automatically',
              ].map((line) => (
                <p key={line} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-amber-400 flex-shrink-0">•</span>
                  <span>{line}</span>
                </p>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">New season name</Label>
              <Input
                placeholder="e.g. 2026–27"
                value={newSeason}
                onChange={(e) => { setNewSeason(e.target.value); setArmed(false); }}
                autoFocus
                className="h-12 text-base"
              />
              {suggestedName && newSeason !== suggestedName && (
                <button
                  onClick={() => { setNewSeason(suggestedName); setArmed(false); }}
                  className="text-xs text-primary hover:underline"
                >
                  Use “{suggestedName}”
                </button>
              )}
            </div>

            <div className="mt-5">
              {!armed ? (
                <Button
                  className="w-full h-12"
                  disabled={!newSeason.trim()}
                  onClick={() => setArmed(true)}
                >
                  Continue
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-center text-amber-300">
                    Archive {currentSeason?.name ?? 'current'} and start{' '}
                    <strong>{newSeason.trim()}</strong>?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12"
                            onClick={() => setArmed(false)} disabled={busy}>
                      Go back
                    </Button>
                    <Button className="flex-1 h-12 bg-amber-500 text-slate-950 hover:bg-amber-400"
                            onClick={rollover} disabled={busy}>
                      {busy ? 'Working…' : '✓ Confirm'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}