'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import { PageShell } from '@/components/cis/page-shell';
import { setRegistrationsConsent } from './actions';
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  secondaryButtonClasses,
} from '@/components/cis/button';
import Link from 'next/link';
import {
  type Division,
  DIVISION_SHORT,
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
  isAdmin,
  season,
}: {
  initial: RosterEntry[];
  isStaff: boolean;
  /** Holds the `admin` role, so may run the CSV import. See page.tsx. */
  isAdmin: boolean;
  season: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  // Sorted here, not by the query. page.tsx orders by `last_name` on the
  // embedded `kids`, which sorts *within* each embed rather than ordering the
  // registrations -- so the roster arrives in no particular order, and only
  // looked sorted once an edit ran it through sortRows. At 300 kids an
  // unalphabetised roster is unscannable.
  const [rows, setRows] = useState<RosterEntry[]>(() => sortRows(initial));
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [missingConsentOnly, setMissingConsentOnly] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (gradeFilter !== 'all' && String(r.grade) !== gradeFilter) return false;
      if (missingConsentOnly && r.consent_given_at !== null) return false;
      if (!q) return true;
      return [
        r.kid.first_name, r.kid.last_name, r.kid.guardian_name,
        r.kid.guardian_phone, r.kid.guardian_email, r.kid.phone,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, gradeFilter, missingConsentOnly]);

  const missingConsent = useMemo(
    () => rows.filter((r) => r.consent_given_at === null).length,
    [rows],
  );

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

  /**
   * Records or withdraws consent for one or more registrations.
   *
   * The timestamp and the attributed user are both set inside the database
   * function -- nothing here supplies them. One call covers the whole batch, so
   * a half-applied selection is not a state the Admin can end up in.
   */
  const applyConsent = async (ids: string[], received: boolean) => {
    if (ids.length === 0) return;

    setConsentBusy(true);
    const result = await setRegistrationsConsent(ids, received);
    setConsentBusy(false);

    if (!result.ok) {
      toast({
        title: 'Could not update consent',
        description: result.error,
        variant: 'destructive',
      });
      return;
    }

    const byId = new Map((result.rows ?? []).map((row) => [row.registrationId, row.consentGivenAt]));
    const next = rows.map((x) =>
      byId.has(x.registration_id)
        ? { ...x, consent_given_at: byId.get(x.registration_id) ?? null }
        : x
    );
    setRows(next);
    setSelected(new Set());

    // Clearing the last outstanding form ends the chase -- staying in the mode
    // would leave an empty roster and, since the chip only renders while there
    // is something to chase, no control left to switch the filter back off.
    if (received && next.every((x) => x.consent_given_at !== null)) {
      setMissingConsentOnly(false);
    }

    toast({
      title: received
        ? `Consent recorded for ${ids.length} ${ids.length === 1 ? 'kid' : 'kids'}`
        : 'Consent cleared',
    });
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** The rows a tick box is offered on: visible, and not already recorded. */
  const selectableIds = useMemo(
    () => filtered.filter((r) => r.consent_given_at === null).map((r) => r.registration_id),
    [filtered],
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  /**
   * Whether to offer tick boxes.
   *
   * Only while the "still owe a consent form" filter is on. Consent is a
   * once-a-season chore, so a permanent column for it would tax every other
   * reading of the roster -- instead the chip is the way in: tap it and the
   * roster narrows to exactly the kids you are chasing, with a box against
   * each. Every visible row is missing consent by definition, so ticking can
   * never overwrite a date that is already recorded.
   */
  const canSelect = isAdmin && missingConsentOnly && selectableIds.length > 0;

  /** Leaving the mode drops the selection with it. */
  const toggleConsentMode = () => {
    setMissingConsentOnly((on) => !on);
    setSelected(new Set());
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
      <div className="flex min-h-screen items-center justify-center bg-cis-page p-4 font-cis-body text-cis-ink">
        <Sheet className="flex w-full max-w-sm flex-col gap-cis-3 px-cis-5 pb-cis-6 pt-cis-6">
          <SheetHeading className="text-cis-xl">Staff only</SheetHeading>
          <p className="m-0 text-cis-base leading-[1.5]">
            Registration records contain minors&apos; personal information and are limited
            to approved staff.
          </p>
          <SecondaryButton block onClick={() => router.push('/')}>
            Back
          </SecondaryButton>
        </Sheet>
      </div>
    );
  }

  // Grade 7 is the only grade that may pick; every other grade is implied by the
  // grade itself, so the select is locked to the one legal value.
  const gradeNumber = parseInt(form.grade, 10);
  const divisionLocked = !!form.grade && gradeNumber !== 7;

  return (
    <>
      <PageShell>
        <div className="flex items-end justify-between gap-cis-3">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="self-start text-cis-sm font-bold text-cis-orange-text underline-offset-2 hover:text-cis-orange-deep hover:underline"
            >
              Back
            </button>
            <h1 className="font-cis-display text-cis-xl font-normal leading-[1.1]">Registration</h1>
            <p className="m-0 text-cis-sm font-semibold text-cis-ink-muted">
              {season ? season.name : 'No active season'} · {rows.length} registered
              {filtered.length !== rows.length && ` · ${filtered.length} shown`}
            </p>
          </div>
          <PrimaryButton className="px-5" onClick={openNew} disabled={!season}>
            Add
          </PrimaryButton>
        </div>

        {!season && (
          <Sheet tone="paper" className="px-cis-5 py-cis-5">
            <p className="m-0 text-cis-base leading-[1.5]">
              No season is marked current, so nobody can be registered yet.
            </p>
          </Sheet>
        )}

        <div className="flex gap-cis-2">
          <Input
            placeholder="Search name, guardian, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-cis-chip border-2 border-cis-ink bg-cis-paper-light text-cis-base text-cis-ink placeholder:text-cis-ink-muted"
          />
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="h-12 rounded-cis-chip border-2 border-cis-ink bg-cis-paper-light px-3 text-cis-base font-bold text-cis-ink"
          >
            <option value="all">All grades</option>
            {REGISTRATION_GRADES.filter((g) => gradeCounts.has(g)).map((g) => (
              <option key={g} value={String(g)}>Grade {g} ({gradeCounts.get(g)})</option>
            ))}
          </select>
        </div>

        {/* Chasing ~300 paper forms is only practical if the roster can be
            narrowed to who still owes one. Same toggle-chip pattern as the
            import screen's "Show only problems". */}
        {(missingConsent > 0 || missingConsentOnly) && (
          <div className="flex flex-wrap items-center gap-cis-2">
            <button
              type="button"
              aria-pressed={missingConsentOnly}
              onClick={toggleConsentMode}
              className={`rounded-cis-chip border-2 border-cis-ink px-3 py-[7px] text-cis-sm font-bold ${
                missingConsentOnly ? 'bg-cis-ink text-cis-paper-light' : 'bg-transparent text-cis-ink'
              }`}
            >
              {missingConsent === 0
                ? 'Everyone has a consent form'
                : `${missingConsent} still owe a consent form`}
            </button>
            {canSelect && (
              <button
                type="button"
                onClick={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
                className="text-cis-sm font-bold text-cis-orange-text underline underline-offset-2 hover:text-cis-orange-deep"
              >
                {allSelected ? 'Clear selection' : `Tick all ${selectableIds.length} shown`}
              </button>
            )}
          </div>
        )}

        {selected.size > 0 && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-cis-3 rounded-cis-sheet bg-cis-ink px-cis-4 py-cis-3 text-cis-paper-light shadow-cis-sheet">
            <span className="text-cis-base font-bold">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-cis-sm font-bold underline underline-offset-2"
            >
              Clear
            </button>
            <PrimaryButton
              className="ml-auto min-h-cis-tap-min px-5 text-cis-base"
              disabled={consentBusy}
              onClick={() => applyConsent([...selected], true)}
            >
              {consentBusy ? 'Saving…' : `Mark ${selected.size} received`}
            </PrimaryButton>
          </div>
        )}

        {filtered.length === 0 ? (
          <Sheet className="flex flex-col gap-cis-2 px-cis-5 pb-cis-6 pt-cis-6 text-center">
            <SheetHeading className="text-cis-xl">
              {rows.length === 0
                ? 'No registrations yet'
                : missingConsentOnly
                  ? 'Nobody left to chase'
                  : 'No matches'}
            </SheetHeading>
            <p className="m-0 text-cis-base leading-[1.5] text-cis-ink-muted">
              {rows.length === 0
                ? 'Tap Add to register a kid.'
                : missingConsentOnly
                  ? 'Every kid matching these filters has a consent form recorded.'
                  : 'Try a different search.'}
            </p>
            {/* The roster is empty at the start of a season, which is exactly
                when the once-a-year import matters. Saying so here is what makes
                the feature findable without anyone having to remember it. */}
            {rows.length === 0 && isAdmin && (
              <p className="m-0 text-cis-base leading-[1.5]">
                Registering a whole season?{' '}
                <Link
                  href="/admin/imports"
                  className="font-bold text-cis-orange-text underline underline-offset-2 hover:text-cis-orange-deep"
                >
                  Import this year&apos;s roster from a CSV
                </Link>
                .
              </p>
            )}
          </Sheet>
        ) : (
          <Sheet className="flex flex-col gap-cis-3 px-cis-4 pb-cis-4 pt-cis-5">
            <SheetHeading>Roster</SheetHeading>

            {/* A real table, per DESIGN_SYSTEM.md §3 -- a roster is tabular data,
                so it is not a grid of cards. Details expand into a row beneath
                rather than opening a second screen, which keeps the whole record
                reachable in one tap on a phone. */}
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {canSelect && <col className="w-[72px]" />}
                <col />
                <col className="w-[52px]" />
                <col className="w-[112px]" />
              </colgroup>
              <thead>
                <tr className="border-b-4 border-cis-ink-dark">
                  {canSelect && (
                    <th scope="col" className="pb-2 pr-2 text-left text-cis-sm font-bold text-cis-ink-muted">
                      Received
                    </th>
                  )}
                  <th scope="col" className="pb-2 text-left text-cis-sm font-bold text-cis-ink-muted">
                    Name
                  </th>
                  <th scope="col" className="pb-2 text-right text-cis-sm font-bold text-cis-ink-muted">
                    Grade
                  </th>
                  <th scope="col" className="pb-2 pl-3 text-left text-cis-sm font-bold text-cis-ink-muted">
                    Division
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const open = expanded === r.registration_id;
                  const panelId = `roster-${r.registration_id}`;

                  return (
                    <Fragment key={r.registration_id}>
                      {/* The whole row is the tap target, not just the name. On a
                          phone a 3-word link is a small thing to hit accurately, and
                          every cell in the row describes the same kid, so there is
                          nothing else a tap here could reasonably mean. */}
                      <tr
                        onClick={() => setExpanded(open ? null : r.registration_id)}
                        className={[
                          'group cursor-pointer align-top',
                          'hover:bg-[rgba(36,31,28,.05)] active:bg-[rgba(36,31,28,.08)]',
                          open ? '' : 'border-b border-cis-rule',
                        ].join(' ')}
                      >
                        {canSelect && (
                          /* Swallows the click so ticking a box never also expands the
                             row -- while marking consent the checkbox is the point, and
                             a panel springing open under every tick would be in the way.
                             The label widens the target to the whole cell. */
                          <td className="py-[10px] pr-2" onClick={(e) => e.stopPropagation()}>
                            <label className="flex min-h-cis-tap-min cursor-pointer items-center">
                              <input
                                type="checkbox"
                                aria-label={`Consent form received for ${r.kid.first_name} ${r.kid.last_name}`}
                                checked={selected.has(r.registration_id)}
                                onChange={() => toggleSelected(r.registration_id)}
                                className="h-5 w-5 accent-[color:var(--cis-orange)]"
                              />
                            </label>
                          </td>
                        )}
                        <td className="py-[10px] pr-[6px]">
                          {/* Deliberately carries no onClick: the row above handles the
                              toggle, and both a pointer click and a keyboard Enter or
                              Space on this button raise a click that bubbles up to it.
                              The real <button> stays because it is what makes the row
                              focusable and announces its expanded state -- an onClick on
                              the <tr> alone would be unreachable without a mouse. */}
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={panelId}
                            className="text-left text-cis-base font-bold leading-[1.3] group-hover:underline"
                          >
                            {r.kid.last_name}, {r.kid.first_name}
                          </button>
                          <div className="text-cis-xs font-semibold text-cis-ink-muted">
                            {fmtDate(r.kid.dob)}
                          </div>
                        </td>
                        <td className="py-[10px] text-right text-cis-base font-extrabold tabular-nums">
                          {r.grade}
                        </td>
                        <td className="py-[10px] pl-3 text-cis-sm font-semibold leading-[1.35]">
                          {DIVISION_SHORT[r.division]}
                        </td>
                      </tr>

                      {open && (
                        <tr id={panelId} className="border-b border-cis-rule">
                          <td colSpan={canSelect ? 4 : 3} className="pb-cis-4">
                            <SheetRule className="mb-cis-3 h-[2px] rounded-none" />

                            <div className="mb-cis-3 flex flex-wrap items-center gap-cis-2 text-cis-sm">
                              <span className="font-semibold text-cis-ink-muted">Consent</span>
                              <span className="font-bold">
                                {r.consent_given_at
                                  ? `Recorded ${fmtDate(r.consent_given_at.slice(0, 10))}`
                                  : 'Not recorded'}
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyConsent([r.registration_id], r.consent_given_at === null)
                                  }
                                  disabled={consentBusy}
                                  className="rounded-cis-chip border-2 border-cis-ink px-3 py-[5px] text-cis-sm font-bold hover:bg-[rgba(36,31,28,.07)] disabled:opacity-50"
                                >
                                  {consentBusy ? 'Saving…' : r.consent_given_at ? 'Clear' : 'Mark received'}
                                </button>
                              )}
                            </div>

                            <dl className="m-0 grid grid-cols-1 gap-[6px] text-cis-sm">
                              {(
                                [
                                  ['T-shirt', r.tshirt_size],
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
                                ] as Array<[string, string | null]>
                              )
                                .filter(([, v]) => v)
                                .map(([k, v]) => (
                                  <div key={k} className="flex gap-cis-2">
                                    <dt className="w-36 flex-shrink-0 font-semibold text-cis-ink-muted">
                                      {k}
                                    </dt>
                                    <dd className="m-0 min-w-0 break-words">{v}</dd>
                                  </div>
                                ))}
                            </dl>

                            <div className="mt-cis-3 flex gap-cis-2">
                              <SecondaryButton
                                className="min-h-cis-tap-min flex-1 px-4 text-cis-base"
                                onClick={() => openEdit(r)}
                              >
                                Edit
                              </SecondaryButton>
                              <DangerButton
                                className="min-h-cis-tap-min px-4 text-cis-base"
                                onClick={() => remove(r)}
                              >
                                Remove
                              </DangerButton>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Sheet>
        )}

        {/* Import sits beside Export because they are the same idea in opposite
            directions, and an Admin looking for "get the roster in" looks where
            "get the roster out" already is. Admin-only, matching the import
            page's own gate. */}
        <div className="flex flex-col gap-cis-2 sm:flex-row">
          <SecondaryButton
            block
            className="sm:flex-1"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            Export CSV
          </SecondaryButton>
          {isAdmin && (
            <Link href="/admin/imports" className={`${secondaryButtonClasses} w-full sm:flex-1`}>
              Import from CSV
            </Link>
          )}
        </div>
      </PageShell>

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
    </>
  );
}
