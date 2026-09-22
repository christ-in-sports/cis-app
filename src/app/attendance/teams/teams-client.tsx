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
  type RosterKid,
  type Division,
  DIVISION_LABEL,
  divisionAllowedForGrade,
} from '@/lib/attendance';

interface Team {
  id: string;
  name: string;
  // `ministry_teams` still spells this `session` in the database; only
  // `registrations` was renamed to `division`.
  session: Division | null;
  active: boolean;
}

interface Coach {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface Link {
  team_id: string;
  user_id: string;
}

/** Prefer the real name; fall back to email only if there's no name yet. */
const coachLabel = (c: Coach) => c.display_name?.trim() || c.email || 'Unnamed user';

export default function TeamsClient({
  isStaff, teams: initialTeams, kids: initialKids, coaches, links: initialLinks,
}: {
  isStaff: boolean;
  teams: Team[];
  kids: RosterKid[];
  coaches: Coach[];
  links: Link[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [teams, setTeams] = useState(initialTeams);
  const [kids, setKids] = useState(initialKids);
  const [links, setLinks] = useState(initialLinks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // No 'unassigned' option any more: division is NOT NULL on registrations, so
  // every kid on the roster now has one.
  const [filter, setFilter] = useState<'all' | Division | 'noteam'>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [showTeam, setShowTeam] = useState(false);
  const [tName, setTName] = useState('');
  const [tSession, setTSession] = useState<'' | Division>('');
  const [tCoaches, setTCoaches] = useState<Set<string>>(new Set());

  const [manageCoaches, setManageCoaches] = useState<string | null>(null);

  const coachById = useMemo(() => {
    const m = new Map<string, Coach>();
    coaches.forEach((c) => m.set(c.id, c));
    return m;
  }, [coaches]);

  const coachesFor = (teamId: string) =>
    links.filter((l) => l.team_id === teamId)
         .map((l) => coachById.get(l.user_id))
         .filter((c): c is Coach => !!c);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kids.filter((k) => {
      if (filter === 'noteam' && k.team_id) return false;
      if ((filter === 'juniors' || filter === 'ambassadors') && k.division !== filter) return false;
      if (!q) return true;
      return `${k.first_name} ${k.last_name}`.toLowerCase().includes(q);
    });
  }, [kids, filter, search]);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;

  const toggleKid = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const bulk = async (patch: { division?: Division; team_id?: string | null }) => {
    if (selected.size === 0) return;

    // A kid's grade constrains which division they may be in
    // (registrations_division_matches_grade). Moving a 9th grader to Juniors is
    // rejected by the database, so skip those rows and say so, rather than
    // letting the whole batch fail on a constraint error.
    let ids = [...selected];
    let skipped = 0;
    if (patch.division) {
      const eligible = ids.filter((id) => {
        const kid = kids.find((k) => k.id === id);
        return kid ? divisionAllowedForGrade(kid.grade, patch.division!) : false;
      });
      skipped = ids.length - eligible.length;
      ids = eligible;
    }

    if (ids.length === 0) {
      toast({
        title: 'Nothing to update',
        description: `Their grade does not allow ${
          patch.division ? DIVISION_LABEL[patch.division] : 'that change'
        }.`,
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('registrations').update(patch).in('id', ids);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      const applied = new Set(ids);
      setKids((p) => p.map((k) => (applied.has(k.id) ? { ...k, ...patch } as RosterKid : k)));
      toast({
        title: `Updated ${ids.length} kid${ids.length === 1 ? '' : 's'}`,
        description: skipped
          ? `${skipped} skipped — their grade does not allow that division.`
          : undefined,
      });
      setSelected(new Set());
    }
    setBusy(false);
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tName.trim()) return;
    setBusy(true);

    const { data, error } = await supabase
      .from('ministry_teams')
      .insert({ name: tName.trim(), session: tSession || null })
      .select('id, name, session, active')
      .single();

    if (error) {
      toast({ title: 'Could not create team', description: error.message, variant: 'destructive' });
      setBusy(false);
      return;
    }

    if (tCoaches.size > 0) {
      const rows = [...tCoaches].map((user_id) => ({ team_id: data.id, user_id }));
      const { error: linkErr } = await supabase.from('team_coaches').insert(rows);
      if (linkErr) {
        toast({ title: 'Team made, coaches failed', description: linkErr.message, variant: 'destructive' });
      } else {
        setLinks((p) => [...p, ...rows]);
      }
    }

    setTeams((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setTName(''); setTSession(''); setTCoaches(new Set()); setShowTeam(false);
    toast({ title: 'Team created' });
    setBusy(false);
  };

  const toggleCoach = async (teamId: string, userId: string) => {
    const exists = links.some((l) => l.team_id === teamId && l.user_id === userId);
    setBusy(true);

    if (exists) {
      const { error } = await supabase
        .from('team_coaches').delete()
        .eq('team_id', teamId).eq('user_id', userId);
      if (error) toast({ title: 'Could not remove coach', description: error.message, variant: 'destructive' });
      else setLinks((p) => p.filter((l) => !(l.team_id === teamId && l.user_id === userId)));
    } else {
      const { error } = await supabase
        .from('team_coaches').insert({ team_id: teamId, user_id: userId });
      if (error) toast({ title: 'Could not add coach', description: error.message, variant: 'destructive' });
      else setLinks((p) => [...p, { team_id: teamId, user_id: userId }]);
    }
    setBusy(false);
  };

  const deleteTeam = async (t: Team) => {
    const n = kids.filter((k) => k.team_id === t.id).length;
    if (!window.confirm(`Delete "${t.name}"?${n ? ` ${n} kid(s) will become unassigned.` : ''}`)) return;
    const { error } = await supabase.from('ministry_teams').delete().eq('id', t.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    setTeams((p) => p.filter((x) => x.id !== t.id));
    setLinks((p) => p.filter((l) => l.team_id !== t.id));
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
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Only staff can create teams or change session assignments.
            </p>
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
          <p className="text-sm text-muted-foreground">
            {kids.length} active kids • {teams.length} teams
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">

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

                <select value={tSession} onChange={(e) => setTSession(e.target.value as any)}
                        className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                  <option value="">Both sessions</option>
                  <option value="juniors">Juniors only</option>
                  <option value="ambassadors">Ambassadors only</option>
                </select>

                <div className="space-y-2">
                  <Label className="text-xs">Coaches (pick any number)</Label>
                  {coaches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No coach accounts yet. Share the coach signup code first.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-auto border border-muted rounded-lg">
                      {coaches.map((c) => {
                        const on = tCoaches.has(c.id);
                        return (
                          <button key={c.id} type="button"
                            onClick={() => setTCoaches((p) => {
                              const n = new Set(p);
                              n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                              return n;
                            })}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-muted/30 last:border-0 ${on ? 'bg-primary/10' : ''}`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary border-primary' : 'border-muted'}`}>
                              {on && <span className="text-[10px]">✓</span>}
                            </div>
                            <span className="text-sm truncate">{coachLabel(c)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full h-12" disabled={busy}>✓ Create Team</Button>
              </form>
            )}

            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No teams yet.</p>
            ) : teams.map((t) => {
              const count = kids.filter((k) => k.team_id === t.id).length;
              const assigned = coachesFor(t.id);
              const open = manageCoaches === t.id;

              return (
                <div key={t.id} className="border-b border-muted/30 last:border-0 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {count} kid{count === 1 ? '' : 's'}
                        {t.session && ` • ${t.session}`}
                        {assigned.length > 0
                          ? ` • ${assigned.map(coachLabel).join(', ')}`
                          : ' • no coach'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-9 text-xs"
                              onClick={() => setManageCoaches(open ? null : t.id)}>
                        {open ? 'Done' : '👤 Coaches'}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-400 h-9"
                              onClick={() => deleteTeam(t)}>✕</Button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-2 border border-muted rounded-lg max-h-48 overflow-auto">
                      {coaches.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">
                          No coach accounts exist yet.
                        </p>
                      ) : coaches.map((c) => {
                        const on = links.some((l) => l.team_id === t.id && l.user_id === c.id);
                        return (
                          <button key={c.id} type="button" disabled={busy}
                            onClick={() => toggleCoach(t.id, c.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-muted/30 last:border-0 ${on ? 'bg-primary/10' : ''}`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary border-primary' : 'border-muted'}`}>
                              {on && <span className="text-[10px]">✓</span>}
                            </div>
                            <span className="text-sm truncate">{coachLabel(c)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                <button key={k.id} onClick={() => toggleKid(k.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-muted/30 last:border-0 ${on ? 'bg-primary/10' : ''}`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary border-primary' : 'border-muted'}`}>
                    {on && <span className="text-[10px]">✓</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{k.last_name}, {k.first_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Grade {k.grade}
                      {' • '}
                      {DIVISION_LABEL[k.division].split(' ')[0]}
                    </p>
                  </div>
                  {k.team_id && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
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
                      onClick={() => bulk({ division: 'juniors' })}>→ Juniors</Button>
              <Button variant="outline" className="flex-1 h-11 text-xs" disabled={busy}
                      onClick={() => bulk({ division: 'ambassadors' })}>→ Ambassadors</Button>
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