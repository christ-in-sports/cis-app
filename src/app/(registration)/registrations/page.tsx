import { getMyRoles } from '@/lib/auth/roles';
import { redirect } from 'next/navigation';
import { embeddedOne } from '@/lib/attendance';
import { type PaymentMethod } from '@/lib/registration/payment';
import { signedPhotoUrls, toKidPhoto } from '@/lib/photo/signed-urls';
import RegistrationsClient, { type RosterEntry } from './registrations-client';

export default async function RegistrationsPage() {
  const { supabase, userId, roles } = await getMyRoles();
  if (!userId) redirect('/login?redirect=/registrations');

  const isAdmin = roles.has('admin');

  // A roster row is a kid plus their registration for the active season. The
  // season has to be resolved first because registrations are per-season now.
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .maybeSingle();

  const { data: rows } = season
    ? await supabase
        .from('registrations')
        .select(
          `id, kid_id, grade, division, tshirt_size, top_sports, active,
           consent_given_at, team_id,
           payments(id, amount_cents, method, received_at),
           kids!inner(
             id, first_name, last_name, dob, gender, allergies, home_address,
             email, phone, emergency_contact_name, emergency_contact_phone,
             guardian_name, guardian_phone, guardian_email, photo_path
           )`
        )
        .eq('season_id', season.id)
        .order('last_name', { referencedTable: 'kids' })
    : { data: [] };

  // `payments` comes back empty for anyone but an Admin: its RLS policy only
  // admits Admin and the kid's linked parent (ENG-9), so there is no need to
  // gate the embed here as well.
  const photoUrls = await signedPhotoUrls(supabase, (rows ?? []).map((r) => embeddedOne(r.kids)?.photo_path));

  const entries: RosterEntry[] = (rows ?? []).flatMap((r) => {
    const row = embeddedOne(r.kids);
    if (!row) return [];
    const { photo_path, ...kid } = row;
    return [{
      registration_id: r.id,
      grade: r.grade,
      division: r.division,
      tshirt_size: r.tshirt_size,
      top_sports: r.top_sports,
      active: r.active,
      consent_given_at: r.consent_given_at,
      team_id: r.team_id,
      payments: (r.payments ?? []).map((p) => ({
        id: p.id,
        amount_cents: p.amount_cents,
        method: p.method as PaymentMethod,
        received_at: p.received_at,
      })),
      kid: { ...kid, photo: toKidPhoto(photo_path, photoUrls) },
    }];
  });

  return (
    <RegistrationsClient
      initial={entries}
      isAdmin={isAdmin}
      season={season ?? null}
    />
  );
}
