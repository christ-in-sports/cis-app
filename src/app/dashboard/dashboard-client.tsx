'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { User } from '@supabase/supabase-js';

interface Tournament {
  id: string;
  name: string;
  status: string;
  team_count: number;
  current_sport: string | null;
  share_code: string;
  created_at: string;
}

interface Membership {
  role: string;
  tournaments: Tournament;
}

export default function DashboardClient({ user, memberships }: { user: User; memberships: Membership[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [teamCount, setTeamCount] = useState('8');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Create tournament
    const { data: tournament, error: createError } = await supabase
      .from('tournaments')
      .insert({
        name,
        owner_id: user.id,
        team_count: parseInt(teamCount),
      })
      .select()
      .single();

    if (createError) {
      setError(createError.message);
      setLoading(false);
      return;
    }

    // Add creator as owner member
    await supabase.from('tournament_members').insert({
      tournament_id: tournament.id,
      user_id: user.id,
      role: 'owner',
    });

    setShowCreate(false);
    router.push(`/tournament/${tournament.id}/setup`);
    router.refresh();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Find tournament by share code
    const { data: tournament, error: findError } = await supabase
      .from('tournaments')
      .select('id')
      .eq('share_code', joinCode.trim().toLowerCase())
      .single();

    if (findError || !tournament) {
      setError('Tournament not found. Check the code and try again.');
      setLoading(false);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('tournament_members')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      router.push(`/tournament/${tournament.id}`);
      return;
    }

    // Join as viewer
    await supabase.from('tournament_members').insert({
      tournament_id: tournament.id,
      user_id: user.id,
      role: 'viewer',
    });

    setShowJoin(false);
    router.push(`/tournament/${tournament.id}`);
    router.refresh();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleDelete = async (tournamentId: string, tournamentName: string) => {
    const confirmed = window.confirm(`Delete "${tournamentName}"? This cannot be undone.`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId)
      .eq('owner_id', user.id);

    if (error) {
      alert('Failed to delete: ' + error.message);
    } else {
      router.refresh();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'setup': return 'bg-yellow-500/20 text-yellow-400';
      case 'completed': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getSportEmoji = (sport: string | null) => {
    switch (sport) {
      case 'soccer': return '⚽';
      case 'basketball': return '🏀';
      case 'volleyball': return '🏐';
      case 'dodgeball': return '🤾';
      default: return '🏆';
    }
  };

  return (
    <div className="min-h-screen p-4 pb-24 safe-top safe-bottom max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Tournaments</h1>
          <p className="text-sm text-muted-foreground">
            {user.user_metadata?.display_name || user.email}
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          ← Home
        </Button>

        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Sign Out
        </Button>
        
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="h-14 text-base">+ Create</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Tournament</DialogTitle>
              <DialogDescription>Set up a new tournament for your ministry</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label>Tournament Name</Label>
                <Input
                  placeholder="e.g., Spring 2026 Tournament"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label>Number of Teams</Label>
                <select
                  value={teamCount}
                  onChange={(e) => setTeamCount(e.target.value)}
                  className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} teams</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full h-12" disabled={loading}>
                {loading ? 'Creating...' : 'Create Tournament'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showJoin} onOpenChange={setShowJoin}>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-14 text-base">Join</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join Tournament</DialogTitle>
              <DialogDescription>Enter the share code to join</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleJoin} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label>Share Code</Label>
                <Input
                  placeholder="e.g., a3f2b1c9"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  required
                  className="h-12 text-center text-lg tracking-widest"
                />
              </div>
              <Button type="submit" className="w-full h-12" disabled={loading}>
                {loading ? 'Joining...' : 'Join Tournament'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tournament List */}
      {memberships.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">🏟️</div>
            <p className="text-muted-foreground">No tournaments yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create one or join with a code!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {memberships.map((m) => (
            <Card key={m.tournaments.id} className="active:scale-[0.98] transition-transform">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => router.push(`/tournament/${m.tournaments.id}`)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {getSportEmoji(m.tournaments.current_sport)}
                    {m.tournaments.name}
                  </CardTitle>
                  <Badge className={getStatusColor(m.tournaments.status)}>
                    {m.tournaments.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{m.tournaments.team_count} teams</span>
                    <Badge variant="outline" className="text-xs">{m.role}</Badge>
                  </div>
                  {m.role === 'owner' && (
                    <Button
                      variant="ghost"
                      className="h-10 w-10 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(m.tournaments.id, m.tournaments.name);
                      }}
                    >
                      🗑️
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}