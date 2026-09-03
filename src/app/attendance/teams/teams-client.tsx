'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  type MinistryTeam, type RosterKid, type Session,
  SESSION_LABEL, defaultSession, gradeNum,
} from '@/lib/attendance';

interface Coach { id: string; display_name: string | null; email: string | null }

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];

export default function TeamsClient({
  isStaff, teams: initialTeams, kids: initialKids, coaches,
}: {
  isStaff: boolean;
  teams: MinistryTeam[];
  kids: RosterKid[];
  coaches: Coach[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [teams, setTeams] = useState(initialTeams);
  const [kids, setKids] = useState(initialKids);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | Session | 'unassigned' | 'noteam'>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [showTeam, setShowTeam] = useState(false);
  const [tName, setTName] = useState('');
  const [tColor, setTColor] = useState(COLORS[0]);
  const [tSession, setTSession] = useState<'' | Session>('');
  const [tCoach, setTCoach] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kids.filter((k) => {
      if (filter === 'unassigned' && k.session) return false;
      if (filter === 'noteam' && k.team_id) return false;
      if ((filter === 'juniors' || filter === 'ambassadors') && k.session !== filter) return false;
      if (!q) return true;
      return `${k.first_name} ${k.last_name}`.toLowerCase().includes(q);
    });
  }, [kids, filter, search]);

  const unassignedCount = kids.filter((k) => !k.session).length;
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;
  const teamColor = (id: string | null) => teams.find((t) => t.id === id)?.color ?? '#444';

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const bulk = async (patch: { session?: Session | null; team_id?: string | null }) => {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = [...selected];
    const { error } = await supabase.from('registrations').update(patch).in('id', ids);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      setKids((p) => p.map((k) => (selected.has(k.id) ? { ...k, ...patch } as RosterKid : k)));
      toast({ title: `Updated ${ids.length} kid${ids.length === 1 ? '' : 's'}` });
      setSelected(new Set());
    }
    setBusy(false);
  };

  /** Fills session from grade for everyone except 7th graders. */
  const autoAssignSessions = async () => {
    const todo = kids
      .filter((k) => !k.session && defaultSession(k.grade))
      .map((k) => ({ id: k.id, session: defaultSession(k.grade)! }));

    if (todo.length === 0) {
      toast({ title: 'Nothing to auto-assign', description: 'Remaining kids are grade 7 or have no grade — assign those by hand.' });
      return;
    }

    setBusy(true);
    for (const t of todo) {
      await supabase.from('registrations').update({ session: t.session }).eq('id', t.id);
    }
    setKids((p) => p.map((k) => {
      const hit = todo.find((t) => t.id === k.id);
      return hit ? { ...k, session: hit.session } : k;
    }));
    toast({ title: `Auto-assigned ${todo.length}`, description: 'Grade 7 kids still need a manual choice.' });
    setBusy(false);
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tName.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from('ministry_teams').insert({
      name: tName.trim(),
      color: tColor,
      session: tSession || null,
      coach_user_id: tCoach || null,
    }).select().single();

    if (error) toast({ title: 'Could not create team', description: error.message, variant: 'destructive' });
    else {
      setTeams((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
      setTName(''); setTCoach(''); setTSession(''); setShowTeam(false);
      toast({ title: 'Team created' });
    }
    setBusy(false);
  };

  const deleteTeam = async (t: MinistryTeam) => {
    const n = kids.filter((k) => k.team_id === t.id).length;
    if (!window.confirm(`Delete "${t.name}"?${n ? ` ${n} kid(s) will become unassigned.` : ''}`)) return;
    const { error } = await supabase.from('ministry_teams').delete().eq('id', t.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    setTeams((p) => p.filter((x) => x.id !== t.id));
    setKids((p) => p.map((k) => (k.team_id === t.id ? { ...k, team_id: null } : k)));
    toast({ title: 'Team deleted' });
  };

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">🔒</div>
            <CardTitle>Staff Only</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full h-12" onClick={() => router.push('/attendance')}>
              ← Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-40 safe-top safe-bottom">
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push('/attendance')}>← Attendance</Button>
          <h1 className="text-xl font-bold mt-1">🧑‍🤝‍🧑 Teams &amp; Sessions</h1>
          <p className="text-sm text-muted-foreground">{kids.length} active kids • {teams.length} teams</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {unassignedCount > 0 && (
          <Card className="border-amber-500/50">
            <CardContent className="py-4 space-y-3">
              <p className="text-sm text-amber-400">
                ⚠️ {unassignedCount} kid{unassignedCount === 1 ? ' ' : 's '} have no session yet — they
                won&apos;t appear on any attendance roster.
              </p>
              <Button variant="outline" className="w-full h-11 text-sm" onClick={autoAssignSessions} disabled={busy}>
                ✨ Auto-assign from grade (skips 7th)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Teams */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Teams</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowTeam((v) => !v)}>
                {showTeam ? 'Cancel' : '+ New'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {showTeam && (
              <form onSubmit={createTeam} className="space-y-3 border border-muted rounded-lg p-3">
                <Input placeholder="Team name (e.g. Lions)" value={tName}
                       onChange={(e) => setTName(e.target.value)} required className="h-12 text-base" />
                <div className="space-y-2">
                  <Label className="text-xs">Color</Label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setTColor(c)}
                        className={`w-9 h-9 rounded-full border-2 ${tColor === c ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <select value={tSession} onChange={(e) => setTSession(e.target.value as any)}
                        className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                  <option value="">Both sessions</option>
                  <option value="juniors">Juniors only</option>
                  <option value="ambassadors">Ambassadors only</option>
                </select>
                <select value={tCoach} onChange={(e) => setTCoach(e.target.value)}
                        className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                  <option value="">No coach assigned</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name || c.email}</option>
                  ))}
                </select>
                <Button type="submit" className="w-full h-12" disabled={busy}>✓ Create Team</Button>
              </form>
            )}

            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No teams yet.</p>
            ) : teams.map((t) => {
              const count = kids.filter((k) => k.team_id === t.id).length;
              const coach = coaches.find((c) => c.id === t.coach_user_id);
              return (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-muted/30 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {count} kid{count === 1 ? '' : 's'}
                        {t.session && ` • ${t.session}`}
                        {coach && ` • ${coach.display_name || coach.email}`}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 h-9" onClick={() => deleteTeam(t)}>✕</Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Roster */}
        <div className="flex gap-2">
          <Input placeholder="Search kids…" value={search}
                 onChange={(e) => setSearch(e.target.value)} className="h-12 text-base" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
                  className="h-12 rounded-lg border border-input bg-background px-3 text-base">
            <option value="all">All</option>
            <option value="juniors">Juniors</option>
            <option value="ambassadors">Ambassadors</option>
            <option value="unassigned">No session</option>
            <option value="noteam">No team</option>
          </select>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{shown.length} shown</CardTitle>
              <button className="text-xs text-primary"
                onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((k) => k.id)))}>
                {selected.size === shown.length && shown.length > 0 ? 'Clear all' : 'Select all'}
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {shown.map((k) => {
              const on = selected.has(k.id);
              return (
                <button key={k.id} onClick={() => toggle(k.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-muted/30 last:border-0 ${on ? 'bg-primary/10' : ''}`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary border-primary' : 'border-muted'}`}>
                    {on && <span className="text-[10px]">✓</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{k.last_name}, {k.first_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {k.grade ? `Grade ${k.grade}` : 'No grade'}
                      {' • '}
                      {k.session ? SESSION_LABEL[k.session].split(' ')[0] : <span className="text-amber-400">no session</span>}
                    </p>
                  </div>
                  {k.team_id && (
                    <Badge variant="outline" className="text-xs flex-shrink-0"
                           style={{ borderColor: teamColor(k.team_id) }}>
                      {teamName(k.team_id)}
                    </Badge>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/98 backdrop-blur border-t border-muted p-4 safe-bottom">
          <div className="max-w-3xl mx-auto space-y-2">
            <p className="text-xs text-muted-foreground">{selected.size} selected</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11 text-xs" disabled={busy}
                      onClick={() => bulk({ session: 'juniors' })}>→ Juniors</Button>
              <Button variant="outline" className="flex-1 h-11 text-xs" disabled={busy}
                      onClick={() => bulk({ session: 'ambassadors' })}>→ Ambassadors</Button>
            </div>
            <select
              className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
              value=""
              onChange={(e) => { if (e.target.value) bulk({ team_id: e.target.value === 'none' ? null : e.target.value }); }}
            >
              <option value="">Assign to team…</option>
              <option value="none">Remove from team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}