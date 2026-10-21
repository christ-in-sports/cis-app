'use client';

/**
 * The Admin servants list: who is serving this season, where, and how to reach
 * them. A real table (`DESIGN_SYSTEM.md` §3), the way the roster is, and a row
 * opens in place to show every field rather than a second screen.
 *
 * Built from the design system's rules and the roster, not from a Claude Design
 * prototype -- none exists (`DESIGN_SYSTEM.md` §10), so treat the layout as
 * provisional. Nothing on it is colour-coded: serving or not is a word, not a
 * dot. The table is wider than a phone, so it scrolls sideways inside its sheet
 * instead of squeezing the columns.
 */

import { Fragment, useState } from 'react';

import { BoardHeader } from '@/components/cis/board-shell';
import { SecondaryButton } from '@/components/cis/button';
import { ChoiceGroup, TextInput } from '@/components/cis/form';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { Sheet, SheetHeading, SheetRule } from '@/components/cis/sheet';
import {
  EVALUATION_LABELS,
  GENDER_LABELS,
  SESSION_LABELS,
  chosenSessions,
  servantsToCsv,
  sessionTeams,
  type ServantListRow,
} from '@/lib/registration/servant-list';

type Show = 'all' | 'serving' | 'not-serving';

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtDob = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-cis-xs font-bold text-cis-ink-muted">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap break-words text-cis-sm font-semibold leading-[1.4]">
        {children || '—'}
      </dd>
    </div>
  );
}

const th = 'pb-2 pr-3 text-left text-cis-sm font-bold text-cis-ink-muted';

export default function ServantsClient({
  seasonName,
  rows,
  loadFailed,
}: {
  seasonName: string;
  rows: ServantListRow[];
  loadFailed: boolean;
}) {
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (show === 'all' || (show === 'serving') === r.is_serving) &&
      (!q || `${r.full_name} ${r.email}`.toLowerCase().includes(q)),
  );

  const serving = rows.filter((r) => r.is_serving).length;

  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([servantsToCsv(filtered)], { type: 'text/csv;charset=utf-8;' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `cis-servants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <BoardHeader kicker="Admin" title="Servants" meta={seasonName} />
      <RegistrationColumn>
        <Sheet className="flex flex-col gap-cis-3 px-cis-4 pb-cis-4 pt-cis-4">
          <p className="m-0 text-cis-sm font-semibold text-cis-ink-muted">
            {rows.length} registered · {serving} serving · {rows.length - serving} not serving
          </p>
          <TextInput
            type="search"
            aria-label="Search servants"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ChoiceGroup
            name="show"
            legend="Show"
            choices={[
              { value: 'all', label: 'Everyone' },
              { value: 'serving', label: 'Serving' },
              { value: 'not-serving', label: 'Not serving' },
            ]}
            value={show}
            onChange={setShow}
          />
        </Sheet>

        {loadFailed ? (
          <Sheet tone="paper" className="px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>Could not load registrations</SheetHeading>
            <p className="mb-0 mt-cis-2 text-cis-base leading-[1.5]">Reload the page to try again.</p>
          </Sheet>
        ) : filtered.length === 0 ? (
          <Sheet tone="paper" className="px-cis-5 pb-cis-6 pt-cis-6">
            <SheetHeading>
              {rows.length === 0 ? 'No registrations yet' : 'No servants match'}
            </SheetHeading>
            <p className="mb-0 mt-cis-2 text-cis-base leading-[1.5]">
              {rows.length === 0
                ? `Nobody has registered for ${seasonName} yet.`
                : 'Try a different search or filter.'}
            </p>
          </Sheet>
        ) : (
          <Sheet className="flex flex-col gap-cis-3 px-cis-4 pb-cis-4 pt-cis-5">
            <SheetHeading>Registrations</SheetHeading>
            {/* Wider than a phone, so it scrolls here rather than squeezing. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b-4 border-cis-ink-dark">
                    <th scope="col" className={th}>Name</th>
                    <th scope="col" className={th}>Serving</th>
                    <th scope="col" className={th}>Sessions and teams</th>
                    <th scope="col" className={th}>Phone</th>
                    <th scope="col" className="pb-2 text-left text-cis-sm font-bold text-cis-ink-muted">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const open = expanded === r.id;
                    const panelId = `servant-${r.id}`;
                    return (
                      <Fragment key={r.id}>
                        {/* The whole row opens it, as on the roster: the button is
                            what makes it focusable and announces its state. */}
                        <tr
                          onClick={() => setExpanded(open ? null : r.id)}
                          className={[
                            'group cursor-pointer align-top',
                            'hover:bg-[rgba(36,31,28,.05)] active:bg-[rgba(36,31,28,.08)]',
                            open ? '' : 'border-b border-cis-rule',
                          ].join(' ')}
                        >
                          <td className="py-[10px] pr-3">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={panelId}
                              className="text-left text-cis-base font-bold leading-[1.3] group-hover:underline"
                            >
                              {r.full_name}
                            </button>
                          </td>
                          <td className="py-[10px] pr-3 text-cis-sm font-bold">
                            {r.is_serving ? 'Yes' : 'No'}
                          </td>
                          <td className="py-[10px] pr-3 text-cis-sm font-semibold leading-[1.4]">
                            {chosenSessions(r).map((s) => (
                              <div key={s}>
                                <span className="font-bold">{SESSION_LABELS[s]}:</span>{' '}
                                {sessionTeams(r, s)}
                              </div>
                            ))}
                          </td>
                          <td className="whitespace-nowrap py-[10px] pr-3 text-cis-sm font-semibold">
                            {r.phone}
                          </td>
                          <td className="whitespace-nowrap py-[10px] text-cis-sm font-semibold">
                            {fmtDay(r.updated_at)}
                          </td>
                        </tr>

                        {open && (
                          <tr id={panelId} className="border-b border-cis-rule">
                            <td colSpan={5} className="pb-cis-4">
                              <SheetRule className="mb-cis-3 h-[2px] rounded-none" />
                              <dl className="m-0 grid grid-cols-1 gap-x-cis-4 gap-y-cis-3 sm:grid-cols-2">
                                <Detail label="Email">{r.email}</Detail>
                                <Detail label="Phone">{r.phone}</Detail>
                                <Detail label="Service Evaluation Status">
                                  {EVALUATION_LABELS[r.evaluation_status]}
                                </Detail>
                                <Detail label="Serving this season">{r.is_serving ? 'Yes' : 'No'}</Detail>
                                {chosenSessions(r).map((s) => (
                                  <Detail key={s} label={`${SESSION_LABELS[s]} teams`}>
                                    {sessionTeams(r, s)}
                                  </Detail>
                                ))}
                                <Detail label="Notes">{r.notes}</Detail>
                                <Detail label="Dates missing">{r.dates_missing}</Detail>
                                <Detail label="Gender">{GENDER_LABELS[r.gender]}</Detail>
                                <Detail label="Date of birth">{fmtDob(r.dob)}</Detail>
                                <Detail label="Home address">{r.home_address}</Detail>
                                <Detail label="Emergency contact">
                                  {`${r.emergency_contact_name}, ${r.emergency_contact_phone}`}
                                </Detail>
                                <Detail label="Registered">{fmtDay(r.created_at)}</Detail>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Sheet>
        )}

        <SecondaryButton block onClick={exportCsv} disabled={filtered.length === 0}>
          Export CSV
        </SecondaryButton>
      </RegistrationColumn>
    </>
  );
}
