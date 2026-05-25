'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Tournament {
  id: string;
  name: string;
  team_count: number;
  status: string;
  share_code: string;
}

export default function JoinClient({
  tournament,
  isLoggedIn,
  userId,
  code,
}: {
  tournament: Tournament;
  isLoggedIn: boolean;
  userId: string | null;
  code: string;
}) {
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleJoin = async () => {
    if (!isLoggedIn) {
      // Redirect to login with a return URL
      router.push(`/login?redirect=/join/${code}`);
      return;
    }

    if (!userId) return;
    setLoading(true);

    const { error } = await supabase
      .from('tournament_members')
      .insert({
        tournament_id: tournament.id,
        user_id: userId,
        role: 'viewer',
      });

    if (error) {
      if (error.code === '23505') {
        // Already a member (unique constraint)
        router.push(`/tournament/${tournament.id}`);
      } else {
        alert('Failed to join: ' + error.message);
      }
    } else {
      setJoined(true);
      setTimeout(() => {
        router.push(`/tournament/${tournament.id}`);
      }, 1000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="py-8 text-center space-y-4">
          {joined ? (
            <>
              <p className="text-4xl">🎉</p>
              <p className="text-lg font-bold">You're in!</p>
              <p className="text-sm text-muted-foreground">Redirecting to tournament...</p>
            </>
          ) : (
            <>
              <p className="text-4xl">🏆</p>
              <h1 className="text-xl font-bold">{tournament.name}</h1>
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline">{tournament.team_count} teams</Badge>
                <Badge variant="outline">{tournament.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                You've been invited to join this tournament
              </p>

              <Button
                className="w-full h-14 text-base"
                onClick={handleJoin}
                disabled={loading}
              >
                {loading ? 'Joining...' : isLoggedIn ? '✓ Join Tournament' : 'Sign In to Join'}
              </Button>

              {!isLoggedIn && (
                <p className="text-xs text-muted-foreground">
                  You'll need to sign in or create an account first
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}