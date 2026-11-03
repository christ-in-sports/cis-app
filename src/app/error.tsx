'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="mb-2 font-cis-display text-2xl font-normal leading-[1.1]">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="inline-flex min-h-cis-tap-min items-center rounded-cis-pill bg-cis-action px-6 font-extrabold text-cis-ink-on-action hover:bg-cis-action-hover"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}