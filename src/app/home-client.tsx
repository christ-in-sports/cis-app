'use client';

import { useRouter } from 'next/navigation';
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
    ready: false,
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
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className={`cursor-pointer transition-all hover:scale-[1.02] ${
                feature.ready
                  ? 'hover:border-primary/50'
                  : 'opacity-60 cursor-not-allowed'
              }`}
              onClick={() => {
                if (feature.ready) {
                  router.push(feature.href);
                }
              }}
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
          ))}
        </div>
      </div>
    </div>
  );
}