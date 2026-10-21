import { attendanceAccess } from '../data';
import SummaryClient from './summary-client';

export default async function SummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, isAdmin } = await attendanceAccess();
  const params = await searchParams;
  const { data: seasons, error: seasonError } = await supabase.from('seasons').select('*').order('starts_on', { ascending: false });
  if (seasonError) throw new Error('Could not load attendance seasons.');
  const selected = seasons?.find((season) => season.id === params.season) ?? seasons?.find((season) => season.is_current) ?? seasons?.[0];
  const { data: rows, error } = selected ? await supabase.rpc('attendance_summary', { p_season: selected.id }) : { data: [], error: null };
  if (error) throw new Error('Could not load the attendance summary.');
  return <SummaryClient isAdmin={isAdmin} seasons={seasons ?? []} seasonId={selected?.id ?? ''} rows={rows ?? []} />;
}
