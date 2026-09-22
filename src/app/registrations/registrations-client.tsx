'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  type Division,
  DIVISION_LABEL,
  REGISTRATION_GRADES,
  defaultDivision,
  divisionAllowedForGrade,
} from '@/lib/attendance';

/** Mirrors the registrations_tshirt_size_values CHECK constraint. */
const TSHIRT_SIZES = ['YS', 'YM', 'YL', 'XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

export interface Kid {
  id: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  allergies: string | null;
  home_address: string;
  email: string | null;
  phone: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
}

/** A kid plus their registration for the active season. */
export interface RosterEntry {
  registration_id: string;
  grade: number;
  division: Division;
  tshirt_size: string;
  top_sports: string[] | null;
  active: boolean;
  consent_given_at: string | null;
  team_id: string | null;
  kid: Kid;
}

interface FormState {
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  allergies: string;
  home_address: string;
  email: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  grade: string;
  division: string;
  tshirt_size: string;
}

const EMPTY: FormState = {
  first_name: '', last_name: '', dob: '', gender: '', allergies: '',
  home_address: '', email: '', phone: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  guardian_name: '', guardian_phone: '', guardian_email: '',
  grade: '', division: '', tshirt_size: '',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
}

const nullIfBlank = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * Rebuilds a roster entry from the two rows a write returns. The list keeps its
 * own state, so it is updated from the write rather than by re-fetching --
 * `router.refresh()` alone would not help, since `rows` is seeded from a prop
 * and useState ignores later prop changes.
 */
function toEntry(reg: RosterEntry_Row, kid: Kid): RosterEntry {
  return {
    registration_id: reg.id,
    grade: reg.grade,
    division: reg.division,
    tshirt_size: reg.tshirt_size,
    top_sports: reg.top_sports,
    active: reg.active,
    consent_given_at: reg.consent_given_at,
    team_id: reg.team_id,
    kid,
  };
}

/** The `registrations` columns a write returns, before the kid is attached. */
interface RosterEntry_Row {
  id: string;
  grade: number;
  division: Division;
  tshirt_size: string;
  top_sports: string[] | null;
  active: boolean;
  consent_given_at: string | null;
  team_id: string | null;
}

const sortRows = (rows: RosterEntry[]) =>
  [...rows].sort(
    (a, b) =>
      a.kid.last_name.localeCompare(b.kid.last_name) ||
      a.kid.first_name.localeCompare(b.kid.first_name)
  );

export default function RegistrationsClient({
  initial,
  isStaff,
  season,
}: {
  initial: RosterEntry[];
  isStaff: boolean;
  season: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [rows, setRows] = useState<RosterEntry[]>(initial);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (gradeFilter !== 'all' && String(r.grade) !== gradeFilter) return false;
      if (!q) return true;
      return [
        r.kid.first_name, r.kid.last_name, r.kid.guardian_name,
        r.kid.guardian_phone, r.kid.guardian_email, r.kid.phone,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, gradeFilter]);

  const gradeCounts = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r) => m.set(r.grade, (m.get(r.grade) ?? 0) + 1));
    return m;
  }, [rows]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  };

  const openEdit = (r: RosterEntry) => {
    setEditing(r);
    setForm({
      first_name: r.kid.first_name,
      last_name: r.kid.last_name,
      dob: r.kid.dob,
      gender: r.kid.gender,
      allergies: r.kid.allergies ?? '',
      home_address: r.kid.home_address,
      email: r.kid.email ?? '',
      phone: r.kid.phone ?? '',
      emergency_contact_name: r.kid.emergency_contact_name,
      emergency_contact_phone: r.kid.emergency_contact_phone,
      guardian_name: r.kid.guardian_name,
      guardian_phone: r.kid.guardian_phone,
      guardian_email: r.kid.guardian_email,
      grade: String(r.grade),
      division: r.division,
      tshirt_size: r.tshirt_size,
    });
    setShowForm(true);
  };

  const set = (k: keyof FormState, v: string) => {
    setForm((p) => {
      const next = { ...p, [k]: v };
      // Grade determines division for every grade except 7, which may choose.
      // Keeping them in step here means the database CHECK constraint never
      // has to reject what the form allowed.
      if (k === 'grade') {
        const implied = defaultDivision(parseInt(v, 10) || null);
        if (implied) next.division = implied;
        else if (p.division && !divisionAllowedForGrade(parseInt(v, 10), p.division as Division)) {
          next.division = '';
        }
      }
      return next;
    });
  };

  const kidPayload = () => ({
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    dob: form.dob,
    gender: form.gender,
    allergies: nullIfBlank(form.allergies),
    home_address: form.home_address.trim(),
    email: nullIfBlank(form.email),
    phone: nullIfBlank(form.phone),
    emergency_contact_name: form.emergency_contact_name.trim(),
    emergency_contact_phone: form.emergency_contact_phone.trim(),
    guardian_name: form.guardian_name.trim(),
    guardian_phone: form.guardian_phone.trim(),
    guardian_email: form.guardian_email.trim(),
  });

  const registrationPayload = () => ({
    grade: parseInt(form.grade, 10),
    division: form.division,
    tshirt_size: form.tshirt_size,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!season) {
      toast({ title: 'No active season', variant: 'destructive' });
      return;
    }
    setSaving(true);

    if (editing) {
      const { data: kid, error: kidErr } = await supabase
        .from('kids').update(kidPayload()).eq('id', editing.kid.id).select().single();
      if (kidErr) {
        toast({ title: 'Update failed', description: kidErr.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      const { data: reg, error: regErr } = await supabase
        .from('registrations').update(registrationPayload())
        .eq('id', editing.registration_id).select().single();
      if (regErr) {
        toast({ title: 'Update failed', description: regErr.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      setRows((p) => sortRows(
        p.map((r) => (r.registration_id === editing.registration_id
          ? { ...r, ...toEntry(reg, kid) }
          : r))
      ));
      toast({ title: 'Saved' });
      setShowForm(false);
      setSaving(false);
      return;
    }

    // A new roster entry spans two tables and the Supabase client has no
    // transaction, so on a failed registration insert the just-created kid is
    // removed again rather than left orphaned with no season registration.
    const { data: kid, error: kidErr } = await supabase
      .from('kids').insert(kidPayload()).select().single();
    if (kidErr) {
      toast({ title: 'Could not add', description: kidErr.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    const { data: reg, error: regErr } = await supabase.from('registrations').insert({
      ...registrationPayload(),
      kid_id: kid.id,
      season_id: season.id,
      source: 'manual',
    }).select().single();

    if (regErr) {
      await supabase.from('kids').delete().eq('id', kid.id);
      const dup = regErr.code === '23505';
      toast({
        title: dup ? 'Already registered' : 'Could not add',
        description: dup
          ? 'This kid already has a registration for the current season.'
          : regErr.message,
        variant: 'destructive',
      });
      setSaving(false);
      return;
    }

    setRows((p) => sortRows([...p, toEntry(reg, kid)]));
    toast({ title: 'Registration added' });
    setShowForm(false);
    setSaving(false);
  };

  const remove = async (r: RosterEntry) => {
    if (!window.confirm(
      `Remove ${r.kid.first_name} ${r.kid.last_name} from ${season?.name ?? 'this season'}? ` +
      `Their record is kept for other seasons.`
    )) return;

    const { error } = await supabase
      .from('registrations').delete().eq('id', r.registration_id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setRows((p) => p.filter((x) => x.registration_id !== r.registration_id));
      toast({ title: 'Removed from season' });
    }
  };

  const exportCsv = () => {
    const csv = Papa.unparse({
      fields: [
        'first_name', 'last_name', 'dob', 'gender', 'grade', 'division', 'tshirt_size',
        'home_address', 'email', 'phone', 'guardian_name', 'guardian_phone',
        'guardian_email', 'emergency_contact_name', 'emergency_contact_phone', 'allergies',
      ],
      data: filtered.map((r) => [
        r.kid.first_name, r.kid.last_name, r.kid.dob, r.kid.gender, r.grade, r.division,
        r.tshirt_size, r.kid.home_address, r.kid.email ?? '', r.kid.phone ?? '',
        r.kid.guardian_name, r.kid.guardian_phone, r.kid.guardian_email,
        r.kid.emergency_contact_name, r.kid.emergency_contact_phone, r.kid.allergies ?? '',
      ]),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cis-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardHeader className="text-center">
            <CardTitle>Staff only</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Registration records contain minors&apos; personal information and are
              limited to approved staff.
            </p>
            <Button variant="outline" className="w-full h-12" onClick={() => router.push('/')}>
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Grade 7 is the only grade that may pick; every other grade is implied by the
  // grade itself, so the select is locked to the one legal value.
  const gradeNumber = parseInt(form.grade, 10);
  const divisionLocked = !!form.grade && gradeNumber !== 7;

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>Back</Button>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-xl font-bold">Registration</h1>
              <p className="text-sm text-muted-foreground">
                {season ? season.name : 'No active season'}
                {' • '}{rows.length} registered
                {filtered.length !== rows.length && ` • ${filtered.length} shown`}
              </p>
            </div>
            <Button className="h-12 px-5" onClick={openNew} disabled={!season}>Add</Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {!season && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p className="text-sm">
                No season is marked current, so nobody can be registered yet.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4">
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              Export CSV
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Input
            placeholder="Search name, guardian, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 text-base"
          />
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          >
            <option value="all">All grades</option>
            {REGISTRATION_GRADES.filter((g) => gradeCounts.has(g)).map((g) => (
              <option key={g} value={String(g)}>Grade {g} ({gradeCounts.get(g)})</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">
                {rows.length === 0 ? 'No registrations yet' : 'No matches'}
              </p>
              <p className="text-sm">
                {rows.length === 0 ? 'Tap Add to register a kid' : 'Try a different search'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {filtered.map((r) => {
                const open = expanded === r.registration_id;
                return (
                  <div key={r.registration_id} className="border-b border-muted/30 last:border-0">
                    <button
                      onClick={() => setExpanded(open ? null : r.registration_id)}
                      className="w-full flex items-center justify-between px-4 py-4 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.kid.last_name}, {r.kid.first_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Grade {r.grade} • {fmtDate(r.kid.dob)}
                          {' • '}{r.division === 'juniors' ? 'Juniors' : 'Ambassadors'}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-xs ml-2">
                        {open ? '▲' : '▼'}
                      </span>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={`text-xs ${
                              r.division === 'juniors'
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-purple-500/20 text-purple-400'
                            }`}
                          >
                            {DIVISION_LABEL[r.division]}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Shirt {r.tshirt_size}
                          </Badge>
                          {!r.consent_given_at && (
                            <Badge className="text-xs bg-amber-500/20 text-amber-400">
                              No consent recorded
                            </Badge>
                          )}
                        </div>

                        <dl className="grid grid-cols-1 gap-1.5 text-xs">
                          {[
                            ['Kid email', r.kid.email],
                            ['Kid phone', r.kid.phone],
                            ['Gender', r.kid.gender],
                            ['Guardian', r.kid.guardian_name],
                            ['Guardian phone', r.kid.guardian_phone],
                            ['Guardian email', r.kid.guardian_email],
                            ['Address', r.kid.home_address],
                            ['Emergency contact', r.kid.emergency_contact_name],
                            ['Emergency phone', r.kid.emergency_contact_phone],
                            ['Allergies', r.kid.allergies],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k as string} className="flex gap-2">
                              <dt className="text-muted-foreground w-32 flex-shrink-0">{k}</dt>
                              <dd className="min-w-0 break-words">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 h-11 text-sm"
                                  onClick={() => openEdit(r)}>
                            Edit
                          </Button>
                          <Button variant="ghost" className="h-11 text-sm text-red-400"
                                  onClick={() => remove(r)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={() => setShowForm(false)} />
          <div className="relative z-50 w-full max-w-md max-h-[88vh] overflow-auto rounded-t-2xl sm:rounded-2xl border bg-background p-6 pb-32 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editing ? 'Edit registration' : 'New registration'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-2xl p-2">✕</button>
            </div>

            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First name *</Label>
                  <Input id="first_name" value={form.first_name} required className="h-12 text-base"
                         onChange={(e) => set('first_name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last name *</Label>
                  <Input id="last_name" value={form.last_name} required className="h-12 text-base"
                         onChange={(e) => set('last_name', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of birth *</Label>
                  <Input id="dob" type="date" value={form.dob} required className="h-12 text-base"
                         onChange={(e) => set('dob', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender *</Label>
                  <select
                    id="gender" value={form.gender} required
                    onChange={(e) => set('gender', e.target.value)}
                    className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="grade">Grade *</Label>
                  <select
                    id="grade" value={form.grade} required
                    onChange={(e) => set('grade', e.target.value)}
                    className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                  >
                    <option value="">—</option>
                    {REGISTRATION_GRADES.map((g) => (
                      <option key={g} value={String(g)}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tshirt_size">T-shirt size *</Label>
                  <select
                    id="tshirt_size" value={form.tshirt_size} required
                    onChange={(e) => set('tshirt_size', e.target.value)}
                    className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                  >
                    <option value="">—</option>
                    {TSHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="division">Division *</Label>
                <select
                  id="division" value={form.division} required disabled={divisionLocked}
                  onChange={(e) => set('division', e.target.value)}
                  className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base disabled:opacity-70"
                >
                  <option value="">—</option>
                  <option value="juniors">Juniors</option>
                  <option value="ambassadors">Ambassadors</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {gradeNumber === 7
                    ? 'Grade 7 may choose either division.'
                    : 'Set automatically from the grade.'}
                </p>
              </div>

              <div className="pt-2 border-t border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-3">Kid contact (optional)</p>
                <div className="space-y-3">
                  <Input placeholder="Kid email" aria-label="Kid email" type="email" value={form.email}
                         className="h-12 text-base"
                         onChange={(e) => set('email', e.target.value)} />
                  <Input placeholder="Kid phone" aria-label="Kid phone" value={form.phone} className="h-12 text-base"
                         onChange={(e) => set('phone', e.target.value)} />
                </div>
              </div>

              <div className="pt-2 border-t border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-3">Parent / guardian *</p>
                <div className="space-y-3">
                  <Input placeholder="Guardian name" aria-label="Guardian name" value={form.guardian_name} required
                         className="h-12 text-base"
                         onChange={(e) => set('guardian_name', e.target.value)} />
                  <Input placeholder="Guardian phone" aria-label="Guardian phone" value={form.guardian_phone} required
                         className="h-12 text-base"
                         onChange={(e) => set('guardian_phone', e.target.value)} />
                  <Input placeholder="Guardian email" aria-label="Guardian email" type="email" value={form.guardian_email}
                         required className="h-12 text-base"
                         onChange={(e) => set('guardian_email', e.target.value)} />
                </div>
              </div>

              <div className="pt-2 border-t border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-3">Emergency contact *</p>
                <div className="space-y-3">
                  <Input placeholder="Emergency contact name" aria-label="Emergency contact name" required
                         value={form.emergency_contact_name} className="h-12 text-base"
                         onChange={(e) => set('emergency_contact_name', e.target.value)} />
                  <Input placeholder="Emergency contact number" aria-label="Emergency contact number" required
                         value={form.emergency_contact_phone} className="h-12 text-base"
                         onChange={(e) => set('emergency_contact_phone', e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="home_address">Home address *</Label>
                <Input id="home_address" value={form.home_address} required className="h-12 text-base"
                       onChange={(e) => set('home_address', e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="allergies">Allergies and medical notes</Label>
                <Input id="allergies" placeholder="Allergies, medication…" value={form.allergies}
                       className="h-12 text-base"
                       onChange={(e) => set('allergies', e.target.value)} />
              </div>

              <Button type="submit" className="w-full h-14 text-base" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add registration'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
