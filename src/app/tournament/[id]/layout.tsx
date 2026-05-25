import BottomNav from '@/components/bottom-nav';

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1">{children}</div>
      <BottomNav tournamentId={id} />
    </div>
  );
}