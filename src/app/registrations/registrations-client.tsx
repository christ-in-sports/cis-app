'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { SESSION_LABEL, type Session } from '@/lib/attendance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  mapHeaders,
  parseRows,
  type RegistrationInput,
  type ParsedRow,
} from '@/lib/registration-csv';

export interface Registration extends RegistrationInput {
  id: string;
  notes: string | null;
  active: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

const EMPTY: RegistrationInput & { notes: string | null } = {
  first_name: '',
  last_name: '',
  email: null,
  gender: null,
  dob: null,
  grade: null,
  address: null,
  youth_phone: null,
  youth_email: null,
  guardian_name: null,
  guardian_phone: null,
  guardian_email: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
  session: null,
};

const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
}

export default function RegistrationsClient({
  initial,
  isStaff,
}: {
  initial: Registration[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Registration[]>(initial);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Registration | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    parsed: ParsedRow[];
    ignored: string[];
    unrecognized: string[];
    fileName: string;
  } | null>(null);
  const [importMode, setImportMode] = useState<'update' | 'skip'>('update');
  const [importing, setImporting] = useState(false);

  // ---------- filtering ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (gradeFilter !== 'all' && (r.grade ?? '') !== gradeFilter) return false;
      if (!q) return true;
      return [
        r.first_name, r.last_name, r.email, r.guardian_name,
        r.guardian_phone, r.guardian_email, r.youth_phone, r.grade,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, gradeFilter]);

  const gradeCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const g = r.grade ?? 'Unknown';
      m.set(g, (m.get(g) ?? 0) + 1);
    });
    return m;
  }, [rows]);

  // ---------- form ----------
  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  };

  const openEdit = (r: Registration) => {
    setEditing(r);
    setForm({
      first_name: r.first_name, last_name: r.last_name, email: r.email,
      gender: r.gender, dob: r.dob, grade: r.grade, address: r.address,
      youth_phone: r.youth_phone, youth_email: r.youth_email,
      guardian_name: r.guardian_name, guardian_phone: r.guardian_phone,
      guardian_email: r.guardian_email,
      emergency_contact_name: r.emergency_contact_name,
      emergency_contact_phone: r.emergency_contact_phone,
      notes: r.notes,
      session: r.session,
    });
    setShowForm(true);
  };

  const set = (k: keyof typeof EMPTY, v: string) =>
    setForm((p) => ({ ...p, [k]: v === '' ? null : v }));

  const setSession = (v: string) =>
    setForm((p) => ({ ...p, session: v === '' ? null : (v as Session) }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      toast({ title: 'First and last name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);

    if (editing) {
      const { data, error } = await supabase
        .from('registrations')
        .update(form)
        .eq('id', editing.id)
        .select()
        .single();

      if (error) {
        toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      } else {
        setRows((p) => p.map((r) => (r.id === data.id ? data : r)));
        toast({ title: 'Saved' });
        setShowForm(false);
      }
    } else {
      const { data, error } = await supabase
        .from('registrations')
        .insert({ ...form, source: 'manual' })
        .select()
        .single();

      if (error) {
        const dup = error.code === '23505' || /duplicate/i.test(error.message);
        toast({
          title: dup ? 'Already registered' : 'Could not add',
          description: dup
            ? 'A kid with this name and date of birth already exists.'
            : error.message,
          variant: 'destructive',
        });
      } else {
        setRows((p) => [...p, data].sort(
          (a, b) => a.last_name.localeCompare(b.last_name) ||
                    a.first_name.localeCompare(b.first_name)
        ));
        toast({ title: 'Registration added' });
        setShowForm(false);
      }
    }
    setSaving(false);
  };

  const remove = async (r: Registration) => {
    if (!window.confirm(`Delete ${r.first_name} ${r.last_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('registrations').delete().eq('id', r.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setRows((p) => p.filter((x) => x.id !== r.id));
      toast({ title: 'Deleted' });
    }
  };

  // ---------- CSV ----------
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const all = res.data.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
        if (all.length < 2) {
          toast({ title: 'Empty file', description: 'Need a header row plus at least one entry.', variant: 'destructive' });
          return;
        }
        const [header, ...body] = all;
        const mapping = mapHeaders(header);

        if (!Object.values(mapping.mapped).includes('first_name') ||
            !Object.values(mapping.mapped).includes('last_name')) {
          toast({
            title: 'Could not find name columns',
            description: 'Expected "CISer First Name" and "CISer Last Name".',
            variant: 'destructive',
          });
          return;
        }

        setPreview({
          parsed: parseRows(body, mapping),
          ignored: mapping.ignored,
          unrecognized: mapping.unrecognized,
          fileName: file.name,
        });
      },
      error: (err) =>
        toast({ title: 'Could not read file', description: err.message, variant: 'destructive' }),
    });

    if (fileRef.current) fileRef.current.value = '';
  };

  const runImport = async () => {
    if (!preview) return;
    const good = preview.parsed.filter((p) => p.data).map((p) => p.data!);
    if (good.length === 0) {
      toast({ title: 'Nothing valid to import', variant: 'destructive' });
      return;
    }

    setImporting(true);
    const res = await fetch('/api/registrations/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: good, mode: importMode }),
    });
    const json = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      toast({ title: 'Import failed', description: json.error ?? 'Unknown error', variant: 'destructive' });
      return;
    }

    toast({
      title: 'Import complete',
      description: `${json.inserted} added, ${json.updated} updated` +
        (json.duplicatesInFile ? `, ${json.duplicatesInFile} duplicate rows in file skipped` : ''),
    });
    setPreview(null);
    router.refresh();
  };

  const exportCsv = () => {
    const cols: (keyof Registration)[] = [
      'first_name', 'last_name', 'email', 'gender', 'dob', 'grade', 'address',
      'youth_phone', 'youth_email', 'guardian_name', 'guardian_phone',
      'guardian_email', 'emergency_contact_name', 'emergency_contact_phone', 'notes',
    ];
    const csv = Papa.unparse({
      fields: cols as string[],
      data: filtered.map((r) => cols.map((c) => r[c] ?? '')),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cis-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- not staff ----------
  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">🔒</div>
            <CardTitle>Staff Only</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Registration records contain minors&apos; personal information and are
              limited to approved staff.
            </p>
            <Button variant="outline" className="w-full h-12" onClick={() => router.push('/')}>
              ← Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const validCount = preview?.parsed.filter((p) => p.data).length ?? 0;
  const badRows = preview?.parsed.filter((p) => !p.data) ?? [];

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>← Back</Button>
          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-xl font-bold">📋 Registration</h1>
              <p className="text-sm text-muted-foreground">
                {rows.length} registered
                {filtered.length !== rows.length && ` • ${filtered.length} shown`}
              </p>
            </div>
            <Button className="h-12 px-5" onClick={openNew}>+ Add</Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Import / export */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Import from Google Form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              In Google Sheets: <strong>File → Download → Comma Separated Values (.csv)</strong>,
              then upload it here. Re-uploading is safe — existing kids are matched by
              name and date of birth, not duplicated.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => fileRef.current?.click()}
              >
                📄 Choose CSV
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={exportCsv}
                disabled={filtered.length === 0}
              >
                ⬇️ Export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Import preview */}
        {preview && (
          <Card className="border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Preview — {preview.fileName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-green-500/20 text-green-400">
                  {validCount} ready
                </Badge>
                {badRows.length > 0 && (
                  <Badge className="bg-red-500/20 text-red-400">
                    {badRows.length} with problems
                  </Badge>
                )}
                {preview.ignored.length > 0 && (
                  <Badge variant="outline">{preview.ignored.length} columns ignored</Badge>
                )}
              </div>

              {preview.unrecognized.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3">
                  <p className="text-xs text-amber-400 font-medium mb-1">
                    Unrecognized columns (will not be imported):
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {preview.unrecognized.join(', ')}
                  </p>
                </div>
              )}

              {badRows.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 max-h-40 overflow-auto">
                  <p className="text-xs text-red-400 font-medium mb-1">Skipped rows:</p>
                  {badRows.slice(0, 12).map((b) => (
                    <p key={b.rowNumber} className="text-xs text-muted-foreground">
                      Row {b.rowNumber}: {b.errors.join('; ')}
                    </p>
                  ))}
                  {badRows.length > 12 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      …and {badRows.length - 12} more
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">If a kid already exists</Label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'update' | 'skip')}
                  className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                >
                  <option value="update">Update with the new info</option>
                  <option value="skip">Leave existing record alone</option>
                </select>
              </div>

              <div className="max-h-48 overflow-auto border border-muted rounded-lg">
                {preview.parsed.filter((p) => p.data).slice(0, 25).map((p) => (
                  <div key={p.rowNumber} className="px-3 py-2 border-b border-muted/30 last:border-0 text-xs">
                    <span className="font-medium">
                      {p.data!.first_name} {p.data!.last_name}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}• {p.data!.grade ? `Grade ${p.data!.grade}` : 'no grade'}
                      {' '}• {fmtDate(p.data!.dob)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-12"
                  onClick={runImport}
                  disabled={importing || validCount === 0}
                >
                  {importing ? 'Importing…' : `✓ Import ${validCount}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search + filter */}
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
            {GRADES.filter((g) => gradeCounts.has(g)).map((g) => (
              <option key={g} value={g}>Grade {g} ({gradeCounts.get(g)})</option>
            ))}
          </select>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">
                {rows.length === 0 ? 'No registrations yet' : 'No matches'}
              </p>
              <p className="text-sm">
                {rows.length === 0
                  ? 'Upload your Google Form CSV or tap + Add'
                  : 'Try a different search'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {filtered.map((r) => {
                const open = expanded === r.id;
                return (
                  <div key={r.id} className="border-b border-muted/30 last:border-0">
                    <button
                      onClick={() => setExpanded(open ? null : r.id)}
                      className="w-full flex items-center justify-between px-4 py-4 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.last_name}, {r.first_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.grade ? `Grade ${r.grade}` : 'No grade'}
                          {r.dob && ` • ${fmtDate(r.dob)}`}
                          {r.session
                            ? ` • ${r.session === 'juniors' ? 'Juniors' : 'Ambassadors'}`
                            : ' • ⚠️ no session'}
                          {r.source === 'import' && ' • imported'}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-xs ml-2">
                        {open ? '▲' : '▼'}
                      </span>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 space-y-3">
                        {/* Session — shown even when unset, since that's a problem */}
                        <div className="flex items-center gap-2">
                          {r.session ? (
                            <Badge
                              className={`text-xs ${
                                r.session === 'juniors'
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'bg-purple-500/20 text-purple-400'
                              }`}
                            >
                              {SESSION_LABEL[r.session]}
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-amber-500/20 text-amber-400">
                              ⚠️ No session — won&apos;t appear on attendance
                            </Badge>
                          )}
                        </div>

                        <dl className="grid grid-cols-1 gap-1.5 text-xs">
                          {[
                            ['Kid email', r.email],
                            ['Youth phone', r.youth_phone],
                            ['Youth email', r.youth_email],
                            ['Gender', r.gender],
                            ['Guardian', r.guardian_name],
                            ['Guardian phone', r.guardian_phone],
                            ['Guardian email', r.guardian_email],
                            ['Address', r.address],
                            ['Emergency contact', r.emergency_contact_name],
                            ['Emergency phone', r.emergency_contact_phone],
                            ['Notes', r.notes],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k as string} className="flex gap-2">
                              <dt className="text-muted-foreground w-32 flex-shrink-0">{k}</dt>
                              <dd className="min-w-0 break-words">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 h-11 text-sm" onClick={() => openEdit(r)}>
                            ✏️ Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-11 text-sm text-red-400"
                            onClick={() => remove(r)}
                          >
                            🗑️ Delete
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

      {/* Add / edit sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={() => setShowForm(false)} />
          <div className="relative z-50 w-full max-w-md max-h-[88vh] overflow-auto rounded-t-2xl sm:rounded-2xl border bg-background p-6 pb-32 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editing ? 'Edit Registration' : 'New Registration'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-2xl p-2">✕</button>
            </div>

            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input value={form.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} required className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input value={form.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} required className="h-12 text-base" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input type="date" value={form.dob ?? ''} onChange={(e) => set('dob', e.target.value)} className="h-12 text-base" />
                </div>
                <div className="space-y-2">
                  <Label>Grade</Label>
                  <select
                    value={form.grade ?? ''}
                    onChange={(e) => set('grade', e.target.value)}
                    className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                  >
                    <option value="">—</option>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Session</Label>
                <select
                  value={form.session ?? ''}
                  onChange={(e) => setSession(e.target.value)}
                  className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                >
                  <option value="">— not set —</option>
                  <option value="juniors">Juniors (4th–7th)</option>
                  <option value="ambassadors">Ambassadors (7th–12th)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Normally filled in from the registration form.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Gender</Label>
                <select
                  value={form.gender ?? ''}
                  onChange={(e) => set('gender', e.target.value)}
                  className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                >
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Kid Email (from form)</Label>
                <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className="h-12 text-base" />
              </div>

              <div className="pt-2 border-t border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-3">YOUTH CONTACT (optional)</p>
                <div className="space-y-3">
                  <Input placeholder="Youth phone" value={form.youth_phone ?? ''} onChange={(e) => set('youth_phone', e.target.value)} className="h-12 text-base" />
                  <Input placeholder="Youth email" type="email" value={form.youth_email ?? ''} onChange={(e) => set('youth_email', e.target.value)} className="h-12 text-base" />
                </div>
              </div>

              <div className="pt-2 border-t border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-3">PARENT / GUARDIAN</p>
                <div className="space-y-3">
                  <Input placeholder="Guardian name" value={form.guardian_name ?? ''} onChange={(e) => set('guardian_name', e.target.value)} className="h-12 text-base" />
                  <Input placeholder="Guardian phone" value={form.guardian_phone ?? ''} onChange={(e) => set('guardian_phone', e.target.value)} className="h-12 text-base" />
                  <Input placeholder="Guardian email" type="email" value={form.guardian_email ?? ''} onChange={(e) => set('guardian_email', e.target.value)} className="h-12 text-base" />
                </div>
              </div>

              <div className="pt-2 border-t border-muted">
                <p className="text-xs font-medium text-muted-foreground mb-3">EMERGENCY CONTACT</p>
                <div className="space-y-3">
                  <Input placeholder="Emergency contact name" value={form.emergency_contact_name ?? ''} onChange={(e) => set('emergency_contact_name', e.target.value)} className="h-12 text-base" />
                  <Input placeholder="Emergency contact number" value={form.emergency_contact_phone ?? ''} onChange={(e) => set('emergency_contact_phone', e.target.value)} className="h-12 text-base" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Home Address</Label>
                <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className="h-12 text-base" />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input placeholder="Allergies, pickup instructions…" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className="h-12 text-base" />
              </div>

              <Button type="submit" className="w-full h-14 text-base" disabled={saving}>
                {saving ? 'Saving…' : editing ? '✓ Save Changes' : '✓ Add Registration'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}