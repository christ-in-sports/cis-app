import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="mb-2 font-cis-display text-2xl font-normal leading-[1.1]">Page Not Found</h1>
        <p className="text-sm text-muted-foreground mb-4">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/" className="inline-flex min-h-cis-tap-min items-center rounded-cis-pill bg-cis-action px-6 font-extrabold text-cis-ink-on-action hover:bg-cis-action-hover">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}