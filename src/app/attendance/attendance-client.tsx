'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  type AttendanceGroup, type AttendanceDay, fmtDay, nextSunday,
} from '@/lib/attendance';

export default function AttendanceClient({
  isStaff, isCoach, groups, days: initialDays, summary,
}: {
  isStaff: boolean;
  isCoach: boolean;
  groups: AttendanceGroup[];
  days: AttendanceDay[];
  summary: Record<string, { total: number; present: number; unmarked: number }>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [days, setDays] = useState(initialDays);
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState(nextSunday());
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? 'Unknown';

  const addDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !date) return;
    setBusy(true);

    const { data, error } = await supabase
      .from('attendance_days')
      .insert({ group_id: groupId, date, label: label.trim() || null })
      .select().single();

    if (error) {
      const dup = error.code === '23505' || /duplicate/i.test(error.message);
      toast({
        title: dup ? 'Day already exists' : 'Could not create day',
        description: dup ? `${groupName(groupId)} already has a day on ${date}.` : error.message,
        variant: 'destructive',
      });
      setBusy(false);
      return;
    }

    // Snapshot the roster from the group's filter
    const { data: n, error: popErr } = await supabase
      .rpc('populate_attendance_day', { p_day: data.id });

    if (popErr) {
      toast({ title: 'Day created but roster failed', description: popErr.message, variant: 'destructive' });
    } else if (!n) {
      toast({
        title: 'Day created, but nobody was added',
        description: 'No active kids match this group. Check that sessions are assigned under Teams & Sessions.',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Day created', description: `${n} kid${n === 1 ? '' : 's'} added` });
    }

    setDays((p) => [data, ...p]);
    setShowAdd(false);
    setLabel('');
    router.push(`/attendance/${data.id}`);
    setBusy(false);
  };

  const removeDay = async (d: AttendanceDay) => {
    if (!window.confirm(`Delete ${groupName(d.group_id)} — ${fmtDay(d.date)}? All marks for that day are lost.`)) return;
    const { error } = await supabase.from('attendance_days').delete().eq('id', d.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    setDays((p) => p.filter((x) => x.id !== d.id));
    toast({ title: 'Day deleted' });
  };

  if (!isCoach) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">🔒</div>
            <CardTitle>No Access</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Attendance is limited to staff and coaches.
            </p>
            <Button variant="outline" className="w-full h-12" onClick={() => router.push('/')}>← Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>← Back</Button>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-xl font-bold">✅ Attendance</h1>
              <p className="text-sm text-muted-foreground">{days.length} days recorded</p>
            </div>
            {isStaff && <Button className="h-12 px-5" onClick={() => setShowAdd((v) => !v)}>+ Add Day</Button>}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {isStaff && (
          <Button variant="outline" className="w-full h-12"
                  onClick={() => router.push('/attendance/teams')}>
            🧑‍🤝‍🧑 Teams &amp; Sessions
          </Button>
        )}

        <Button variant="outline" className="w-full h-12"
                onClick={() => router.push('/attendance/summary')}>
          📊 Attendance Summary
        </Button>

        {showAdd && isStaff && (
          <Card className="border-primary/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">New Attendance Day</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addDay} className="space-y-3">
                <div className="space-y-2">
                  <Label>Session</Label>
                  <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
                          className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input placeholder="e.g. Week 3, Retreat" value={label}
                         onChange={(e) => setLabel(e.target.value)} className="h-12 text-base" />
                </div>
                <p className="text-xs text-muted-foreground">
                  The roster fills in automatically from the session&apos;s saved filter.
                </p>
                <Button type="submit" className="w-full h-12" disabled={busy}>
                  {busy ? 'Creating…' : '✓ Create & Take Attendance'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {days.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">No attendance days yet</p>
              {isStaff && <p className="text-sm">Tap + Add Day to start</p>}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {days.map((d) => {
                const s = summary[d.id] ?? { total: 0, present: 0, unmarked: 0 };
                const pct = s.total ? Math.round((s.present / s.total) * 100) : 0;
                return (
                  <div key={d.id} className="flex items-center border-b border-muted/30 last:border-0">
                    <button onClick={() => router.push(`/attendance/${d.id}`)}
                            className="flex-1 px-4 py-4 text-left min-w-0">
                      <p className="text-sm font-medium truncate">
                        {groupName(d.group_id)}{d.label && ` — ${d.label}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmtDay(d.date)}</p>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        {s.total === 0 ? (
                          <Badge variant="outline" className="text-xs">empty roster</Badge>
                        ) : (
                          <>
                            <Badge className="text-xs bg-green-500/20 text-green-400">
                              {s.present}/{s.total} • {pct}%
                            </Badge>
                            {s.unmarked > 0 && (
                              <Badge className="text-xs bg-amber-500/20 text-amber-400">
                                {s.unmarked} unmarked
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                    {isStaff && (
                      <button onClick={() => removeDay(d)} className="px-4 py-4 text-red-400 text-sm">✕</button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}