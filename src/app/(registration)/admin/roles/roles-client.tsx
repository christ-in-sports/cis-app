'use client';

/**
 * The Admin roles screen: every servant's account, and a tick box per role.
 *
 * People with no role come first, because they are the new servants waiting for
 * access. That order is fixed when the page loads: re-sorting as boxes are
 * ticked would move a row out from under the Admin's thumb.
 *
 * Each tick is saved straight away (a Server Action per change), shown at once and
 * put back, with the reason under that person's row, if the save fails. An
 * Admin's own Admin box is disabled; the database enforces the same rule, so
 * this is only the explanation.
 *
 * The boxes stay disabled until the page has hydrated. Before that the markup is
 * on screen but nothing is listening, so a tap on a box would go nowhere; a faded
 * box says "not ready" instead of silently eating the tap.
 */

import { useState, useSyncExternalStore } from 'react';

import { BoardHeader } from '@/components/cis/board-shell';
import { FieldError, TextInput, TickRow } from '@/components/cis/form';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { Sheet, SheetRule } from '@/components/cis/sheet';
import { ASSIGNABLE_ROLES, ROLE_LABELS, type AppRole, type AssignableRole } from '@/lib/auth/app-roles';
import { grantRole, revokeRole } from './actions';

export interface PersonRoles {
  id: string;
  name: string | null;
  email: string | null;
  roles: AppRole[];
}

const byName = (a: PersonRoles, b: PersonRoles) =>
  (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '');

const noSubscription = () => () => {};

/** False on the server and during hydration, true once the client has taken over. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export default function RolesClient({
  people,
  currentUserId,
}: {
  people: PersonRoles[];
  currentUserId: string;
}) {
  const hydrated = useHydrated();

  // The order is decided once, from what the page loaded.
  const [order] = useState(() =>
    [...people]
      .sort((a, b) => Number(a.roles.length > 0) - Number(b.roles.length > 0) || byName(a, b))
      .map((p) => p.id),
  );
  const [roles, setRoles] = useState<Record<string, AppRole[]>>(() =>
    Object.fromEntries(people.map((p) => [p.id, p.roles])),
  );
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const byId = new Map(people.map((p) => [p.id, p]));
  const q = search.trim().toLowerCase();
  const shown = order
    .map((id) => byId.get(id)!)
    .filter((p) => !q || `${p.name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q));

  const withoutRole = people.filter((p) => (roles[p.id] ?? []).length === 0).length;

  async function setRole(person: PersonRoles, role: AssignableRole, on: boolean) {
    const key = `${person.id}:${role}`;
    if (saving.has(key)) return;

    setErrors((e) => ({ ...e, [person.id]: '' }));
    setSaving((s) => new Set(s).add(key));
    const before = roles[person.id] ?? [];
    setRoles((r) => ({
      ...r,
      [person.id]: on ? [...before.filter((x) => x !== role), role] : before.filter((x) => x !== role),
    }));

    let failure: string | null = null;
    try {
      const result = on ? await grantRole(person.id, role) : await revokeRole(person.id, role);
      if (!result.ok) failure = result.error ?? 'Could not change the role.';
    } catch {
      // The request itself failed (offline, or the page is from an older deploy).
      failure = 'Could not reach the server. Reload the page and try again.';
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }

    if (failure) {
      setRoles((r) => ({ ...r, [person.id]: before }));
      setErrors((e) => ({ ...e, [person.id]: failure }));
    }
  }

  return (
    <>
      <BoardHeader kicker="Admin" title="Roles" />
      <RegistrationColumn>
        <Sheet className="flex flex-col gap-cis-3 px-cis-4 pb-cis-4 pt-cis-4">
          <p className="m-0 text-cis-sm font-semibold text-cis-ink-muted">
            {people.length} {people.length === 1 ? 'person' : 'people'} ·{' '}
            {withoutRole === 0
              ? 'everyone has a role'
              : `${withoutRole} ${withoutRole === 1 ? 'has' : 'have'} no role yet`}
          </p>
          <TextInput
            type="search"
            aria-label="Search people"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Sheet>

        <Sheet className="px-cis-4 pb-cis-2 pt-cis-2">
          {shown.length === 0 && (
            <p className="m-0 py-cis-4 text-cis-base text-cis-ink-muted">
              {q ? 'Nobody matches that search.' : 'No accounts yet.'}
            </p>
          )}
          {shown.map((person, index) => {
            const held = roles[person.id] ?? [];
            const isYou = person.id === currentUserId;
            const label = person.name ?? person.email ?? 'this person';
            return (
              <section key={person.id} aria-label={person.name ?? person.email ?? 'Unnamed'}>
                {index > 0 && <SheetRule />}
                <div className="py-cis-3">
                  <p className="m-0 text-cis-base font-bold text-cis-ink">
                    {person.name ?? person.email ?? 'Unnamed'}
                    {isYou && <span className="font-semibold text-cis-ink-muted"> (you)</span>}
                  </p>
                  {person.name && person.email && (
                    <p className="m-0 break-all text-cis-sm text-cis-ink-muted">{person.email}</p>
                  )}
                  {held.length === 0 && (
                    <p className="m-0 mt-1 text-cis-sm font-bold text-cis-ink-muted">No role yet</p>
                  )}
                  <div className="mt-cis-2 grid grid-cols-2 gap-x-cis-3">
                    {ASSIGNABLE_ROLES.map((role) => {
                      const own = isYou && role === 'admin';
                      return (
                        <TickRow
                          key={role}
                          checked={held.includes(role)}
                          disabled={!hydrated || own}
                          onChange={(on) => {
                            // The box is disabled; this covers anything that bypasses that.
                            if (!own) setRole(person, role, on);
                          }}
                        >
                          <span aria-label={`${ROLE_LABELS[role]} for ${label}`}>{ROLE_LABELS[role]}</span>
                        </TickRow>
                      );
                    })}
                  </div>
                  {errors[person.id] && <FieldError>{errors[person.id]}</FieldError>}
                  {isYou && held.includes('admin') && (
                    <p className="m-0 mt-1 text-cis-sm text-cis-ink-muted">
                      You can&apos;t remove your own Admin role. Another Admin can.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </Sheet>
      </RegistrationColumn>
    </>
  );
}
