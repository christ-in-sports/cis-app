import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center safe-top safe-bottom">
      <div className="text-6xl mb-4">🏆</div>
      <h1 className="text-3xl font-bold mb-2">CIS</h1>
      <h2 className="text-xl text-muted-foreground mb-8">Tournament Manager</h2>
      
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link href="/login">
          <Button className="w-full h-12 text-base">Sign In</Button>
        </Link>
        <Link href="/signup">
          <Button variant="outline" className="w-full h-12 text-base">Create Account</Button>
        </Link>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-4 text-sm text-muted-foreground max-w-xs">
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">⚽</span>
          <span>Soccer</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">🏀</span>
          <span>Basketball</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">🏐</span>
          <span>Volleyball</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">🤾</span>
          <span>Dodgeball</span>
        </div>
      </div>
    </div>
  );
}