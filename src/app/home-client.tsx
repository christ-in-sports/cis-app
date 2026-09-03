'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

interface User {
  id: string;
  email?: string;
}

const FEATURES = [
  {
    title: 'Tournament Manager',
    description: 'Create and manage sports tournaments with fixtures, scores, and standings',
    emoji: '🏆',
    href: '/dashboard',
    ready: true,
  },
  {
    title: 'Attendance',
    description: 'Track member attendance',
    emoji: '📝',
    href: '/attendance',
    ready: true,
  },
  {
    title: 'Spiritual Scoring',
    description: 'Track spiritual activities',
    emoji: '✝️',
    href: '/spiritual',
    ready: false,
  },
  {
    title: 'Registration',
    description: 'View and edit registration',
    emoji: '✍🏻',
    href: '/registrations',
    ready: true,
  },
];

export default function HomeClient({ user }: { user: User }) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-muted">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Christ in Sports Portal</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Welcome back, {user.email?.split('@')[0] || 'User'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((feature) => {
            const card = (
              <Card
                className={`h-full transition-all ${
                  feature.ready
                    ? 'cursor-pointer hover:scale-[1.02] hover:border-primary/50'
                    : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="text-2xl">{feature.emoji}</span>
                      {feature.title}
                    </CardTitle>
                    {!feature.ready && (
                      <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            );

            return feature.ready ? (
              <Link
                key={feature.title}
                href={feature.href}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {card}
              </Link>
            ) : (
              <div key={feature.title} aria-disabled="true">
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}