'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  type AttendanceDay, type AttendanceRecord, type RosterKid,
  type MinistryTeam, type AttStatus,
  STATUS_STYLE, nextStatus, fmtDay,
} from '@/lib/attendance';

const NO_TEAM = '__none__';

export default function TakeClient({
  day, groupName, records: initial, kids, teams, isStaff, userId,
}: {
  day: AttendanceDay;
  groupName: string;
  records: AttendanceRecord[];
  kids: RosterKid[];
  teams: MinistryTeam[];
  isStaff: boolean;
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [records, setRecords] = useState(initial);
  const [search, setSearch] = useState('');
  const [teamTab, setTeamTab] = useState<string>('all');
  const [busy, setBusy] = useState(false);

  const kidById = useMemo(() => {
    const m = new Map<string, RosterKid>();
    kids.forEach((k) => m.set(k.id, k));
    return m;
  }, [kids]);

  /** My teams as a coach — used to default the tab and to gray out others. */
  const myTeamIds = useMemo(
    () => new Set(teams.filter((t) => t.coach_user_id === userId).map((t) => t.id)),
    [teams, userId]
  );

  useEffect(() => {
    if (!isStaff && myTeamIds.size > 0) setTeamTab([...myTeamIds][0]);
  }, [isStaff, myTeamIds]);

  // Two coaches at once
  useEffect(() => {
    const ch = supabase
      .channel(`att-${day.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `day_id=eq.${day.id}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            const old = p.old as Partial<AttendanceRecord>;
            setRecords((prev) => prev.filter((r) => r.id !== old.id));
          } else {
            const row = p.new as AttendanceRecord;
            setRecords((prev) =>
              prev.some((r) => r.id === row.id)
                ? prev.map((r) => (r.id === row.id ? row : r))
                : [...prev, row]
            );
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [day.id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .map((r) => ({ rec: r, kid: kidById.get(r.registration_id) }))
      .filter((x): x is { rec: AttendanceRecord; kid: RosterKid } => !!x.kid)
      .filter(({ kid }) => {
        if (teamTab === 'all') return true;
        if (teamTab === NO_TEAM) return !kid.team_id;
        return kid.team_id === teamTab;
      })
      .filter(({ kid }) => !q || `${kid.first_name} ${kid.last_name}`.toLowerCase().includes(q))
      .sort((a, b) =>
        a.kid.last_name.localeCompare(b.kid.last_name) ||
        a.kid.first_name.localeCompare(b.kid.first_name)
      );
  }, [records, kidById, teamTab, search]);

  const stats = useMemo(() => {
    let present = 0, absent = 0, unmarked = 0;
    records.forEach((r) => {
      if (r.status === 'present' || r.status === 'late') present++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'unmarked') unmarked++;
    });
    return { present, absent, unmarked, total: records.length };
  }, [records]);

  const teamTabs = useMemo(() => {
    const used = new Set(kids.map((k) => k.team_id ?? NO_TEAM));
    const list = teams.filter((t) => used.has(t.id)).map((t) => ({ id: t.id, name: t.name, color: t.color }));
    if (used.has(NO_TEAM)) list.push({ id: NO_TEAM, name: 'No team', color: '#555' });
    return list;
  }, [kids, teams]);

  const canMark = (kid: RosterKid) =>
    isStaff || (kid.team_id ? myTeamIds.has(kid.team_id) : false);

  const mark = async (rec: AttendanceRecord, kid: RosterKid, status: AttStatus) => {
    if (day.locked) return toast({ title: 'Day is locked', variant: 'destructive' });
    if (!canMark(kid)) {
      return toast({ title: 'Not your team', description: 'Only this team\'s coach or staff can mark.', variant: 'destructive' });
    }

    const before = rec.status;
    setRecords((p) => p.map((r) => (r.id === rec.id ? { ...r, status } : r)));

    const { error } = await supabase
      .from('attendance_records')
      .update({ status, method: 'manual', marked_by: userId, marked_at: new Date().toISOString() })
      .eq('id', rec.id);

    if (error) {
      setRecords((p) => p.map((r) => (r.id === rec.id ? { ...r, status: before } : r)));
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    }
  };

  /** Mark everyone currently visible and still unmarked. */
  const markRest = async (status: AttStatus) => {
    const targets = visible.filter(({ rec, kid }) => rec.status === 'unmarked' && canMark(kid));
    if (targets.length === 0) return toast({ title: 'Nothing left to mark' });
    if (!window.confirm(`Mark ${targets.length} unmarked kid(s) as ${status}?`)) return;

    setBusy(true);
    const ids = targets.map((t) => t.rec.id);
    const { error } = await supabase
      .from('attendance_records')
      .update({ status, method: 'manual', marked_by: userId, marked_at: new Date().toISOString() })
      .in('id', ids);

    if (error) toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    else {
      setRecords((p) => p.map((r) => (ids.includes(r.id) ? { ...r, status } : r)));
      toast({ title: `Marked ${ids.length} as ${status}` });
    }
    setBusy(false);
  };

  const refreshRoster = async () => {
    setBusy(true);
    const { data: n, error } = await supabase.rpc('populate_attendance_day', { p_day: day.id });
    setBusy(false);
    if (error) return toast({ title: 'Refresh failed', description: error.message, variant: 'destructive' });
    toast({
      title: n ? `Added ${n} new kid${n === 1 ? '' : 's'}` : 'No new kids to add',
      description: n ? undefined : 'Everyone matching this session is already on the roster.',
    });
    if (n) router.refresh();
  };

  return (
    <div className="min-h-screen pb-40 safe-top safe-bottom">
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push('/attendance')}>← Attendance</Button>
          <h1 className="text-lg font-bold mt-1">
            {groupName}{day.label && ` — ${day.label}`}
          </h1>
          <p className="text-sm text-muted-foreground">{fmtDay(day.date)}</p>

          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge className="text-xs bg-green-500/20 text-green-400">{stats.present} present</Badge>
            <Badge className="text-xs bg-red-500/20 text-red-400">{stats.absent} absent</Badge>
            {stats.unmarked > 0 && (
              <Badge className="text-xs bg-amber-500/20 text-amber-400">{stats.unmarked} unmarked</Badge>
            )}
            <Badge variant="outline" className="text-xs">{stats.total} total</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {stats.total === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-lg text-muted-foreground">Empty roster</p>
              <p className="text-sm text-muted-foreground">
                No active kids matched this session. Assign sessions first.
              </p>
              {isStaff && (
                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="outline" className="h-11" onClick={() => router.push('/attendance/teams')}>
                    🧑‍🤝‍🧑 Teams &amp; Sessions
                  </Button>
                  <Button variant="ghost" className="h-11 text-sm" onClick={refreshRoster} disabled={busy}>
                    🔄 Retry roster fill
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Team tabs */}
            {teamTabs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                <button onClick={() => setTeamTab('all')}
                  className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm ${teamTab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  All ({records.length})
                </button>
                {teamTabs.map((t) => {
                  const n = kids.filter((k) => (k.team_id ?? NO_TEAM) === t.id).length;
                  const mine = myTeamIds.has(t.id);
                  return (
                    <button key={t.id} onClick={() => setTeamTab(t.id)}
                      className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${teamTab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name} ({n}){mine && ' ★'}
                    </button>
                  );
                })}
              </div>
            )}

            <Input placeholder="Search this list…" value={search}
                   onChange={(e) => setSearch(e.target.value)} className="h-12 text-base" />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{visible.length} shown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {visible.map(({ rec, kid }) => {
                  const st = STATUS_STYLE[rec.status];
                  const allowed = canMark(kid) && !day.locked;
                  return (
                    <div key={rec.id} className="px-4 py-3 border-b border-muted/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => mark(rec, kid, nextStatus(rec.status))}
                          disabled={!allowed}
                          className={`flex-1 flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left ${st.cls} ${!allowed ? 'opacity-50' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {kid.first_name} {kid.last_name}
                            </p>
                            <p className="text-xs opacity-70">
                              {kid.grade ? `Grade ${kid.grade}` : 'No grade'}
                              {rec.method !== 'manual' && ` • ${rec.method}`}
                            </p>
                          </div>
                          <span className="text-sm font-bold flex-shrink-0">{st.label}</span>
                        </button>

                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button onClick={() => mark(rec, kid, 'late')} disabled={!allowed}
                            className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-bold disabled:opacity-40">L</button>
                          <button onClick={() => mark(rec, kid, 'excused')} disabled={!allowed}
                            className="w-9 h-9 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-bold disabled:opacity-40">E</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {isStaff && (
              <Button variant="ghost" className="w-full h-11 text-xs" onClick={refreshRoster} disabled={busy}>
                🔄 Add newly registered kids to this day
              </Button>
            )}
          </>
        )}
      </div>

      {/* Sticky bulk actions */}
      {stats.unmarked > 0 && stats.total > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/98 backdrop-blur border-t border-muted p-4 safe-bottom">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Button variant="outline" className="flex-1 h-12 text-sm" disabled={busy}
                    onClick={() => markRest('present')}>
              ✓ Rest present
            </Button>
            <Button variant="outline" className="flex-1 h-12 text-sm" disabled={busy}
                    onClick={() => markRest('absent')}>
              ✕ Rest absent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}