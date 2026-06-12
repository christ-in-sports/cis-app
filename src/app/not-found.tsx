import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🤷</p>
        <h1 className="text-xl font-bold mb-2">Page Not Found</h1>
        <p className="text-sm text-muted-foreground mb-4">The page you're looking for doesn't exist.</p>
        <Link href="/" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}