import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { attendanceAccess } from '../../data';
import { attendanceQrValue } from '@/lib/attendance-qr';
import { type RosterKid, DIVISION_SHORT } from '@/lib/attendance';
import { BoardHeader } from '@/components/cis/board-shell';
import { AttendanceSheet } from '../../parts';
import { PrintCodesButton } from './print-button';

export default async function AttendanceCodesPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kid?: string }>;
}) {
  const { id } = await params;
  const { kid } = await searchParams;
  const { supabase } = await attendanceAccess();
  const { data: day, error: dayError } = await supabase.from('attendance_days').select('id').eq('id', id).maybeSingle();
  if (dayError) throw new Error('Could not load attendance.');
  if (!day) notFound();
  const { data, error } = await supabase.rpc('attendance_day_roster', { p_day: id });
  if (error) throw new Error('Could not load QR cards.');
  const rows = (data ?? []) as RosterKid[];
  const kids = [...new Map(rows.filter((row) => !kid || row.kid_id === kid).map((row) => [row.kid_id, row])).values()]
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  if (kid && !kids.length) notFound();
  const cards = await Promise.all(kids.map(async (row) => ({ ...row, image: await QRCode.toDataURL(attendanceQrValue(row.kid_id), { width: 360, margin: 4, errorCorrectionLevel: 'M' }) })));
  return <>
    <div className="print:hidden"><BoardHeader title="Attendance QR cards" />
      <AttendanceSheet>
        <p className="leading-relaxed">Print and cut out a card for each kid. Cards work across attendance days; a signed-in Admin or assigned Coach must scan them in the app.</p>
        <div className="flex flex-col items-start gap-5">
          <PrintCodesButton />
          <nav aria-label="QR card navigation" className="flex w-full flex-col gap-2 border-t border-cis-rule pt-4 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <Link href={`/attendance/${id}`} className="inline-flex min-h-11 items-center font-bold underline">Back to attendance</Link>
            {kid && <Link href={`/attendance/${id}/codes`} className="inline-flex min-h-11 items-center font-bold underline">All QR cards</Link>}
          </nav>
        </div>
      </AttendanceSheet>
    </div>
    <div className="attendance-codes-print grid gap-4 px-4 text-cis-ink">
      {!cards.length && <p>No kids on your accessible roster.</p>}
      {cards.map((row) => <article key={row.kid_id} className="attendance-qr-card rounded-cis-chip bg-white p-4 text-center">
        <p className="font-bold">Christ in Sports · Attendance</p>
        <Image src={row.image} alt={`Attendance QR code for ${row.first_name} ${row.last_name}`} width={180} height={180} unoptimized className="mx-auto" />
        <h2 className="text-cis-md font-bold">{row.first_name} {row.last_name}</h2>
        <p>{DIVISION_SHORT[row.division]}</p>
        <Link href={`/attendance/${id}/codes?kid=${row.kid_id}`} className="inline-flex min-h-11 items-center font-bold underline print:hidden">Print this kid’s card</Link>
      </article>)}
    </div>
  </>;
}
