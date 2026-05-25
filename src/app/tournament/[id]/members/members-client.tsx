'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Tournament {
  id: string;
  name: string;
  share_code: string;
  owner_id: string;
}

interface Member {
  id: string;
  user_id: string;
  tournament_id: string;
  role: string;
  email: string | null;
  display_name: string | null;
}

export default function MembersClient({
  tournament,
  members: initialMembers,
  currentUserId,
  currentRole,
}: {
  tournament: Tournament;
  members: Member[];
  currentUserId: string;
  currentRole: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const isOwner = currentRole === 'owner';
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  const copyShareCode = () => {
    navigator.clipboard.writeText(tournament.share_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}/join/${tournament.share_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const changeRole = async (memberId: string, userId: string, newRole: string) => {
    if (userId === currentUserId) return;
    if (!isOwner && newRole === 'owner') return;
    if (!isAdmin) return;

    setLoading(memberId);

    const { error } = await supabase
      .from('tournament_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      alert('Failed to update role: ' + error.message);
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    }
    setLoading(null);
  };

  const removeMember = async (memberId: string, userId: string) => {
    if (userId === currentUserId) return;
    if (userId === tournament.owner_id) return;
    if (!isAdmin) return;

    const confirmed = window.confirm('Remove this member from the tournament?');
    if (!confirmed) return;

    setLoading(memberId);

    const { error } = await supabase
      .from('tournament_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      alert('Failed to remove: ' + error.message);
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    }
    setLoading(null);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-yellow-500/20 text-yellow-400';
      case 'admin': return 'bg-green-500/20 text-green-400';
      case 'viewer': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleEmoji = (role: string) => {
    switch (role) {
      case 'owner': return '👑';
      case 'admin': return '⚡';
      case 'viewer': return '👁️';
      default: return '👤';
    }
  };

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-lg mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/tournament/${tournament.id}`)}>
            ← Back
          </Button>
          <h1 className="text-xl font-bold mt-1">👥 Members</h1>
          <p className="text-sm text-muted-foreground">{tournament.name}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Share Section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Invite People</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Share Code</p>
                <p className="text-2xl font-bold font-mono tracking-wider">{tournament.share_code}</p>
              </div>
              <Button
                variant="outline"
                className="h-14 px-4"
                onClick={copyShareCode}
              >
                {copied ? '✓' : '📋'}
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full h-12"
              onClick={async () => {
                const link = `${window.location.origin}/join/${tournament.share_code}`;
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: tournament.name,
                      text: `Join my tournament: ${tournament.name}`,
                      url: link,
                    });
                  } catch (e) {
                    // User cancelled share
                  }
                } else {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? '✓ Copied!' : '📤 Share Join Link'}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Anyone with the code/link can join as a viewer
            </p>
          </CardContent>
        </Card>

        {/* Members List */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Members ({members.length})</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => router.refresh()}>
                🔄 Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {members.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                <p>No members yet</p>
                <p className="text-xs mt-1">Share the code to invite people</p>
              </div>
            ) : (
              members.map((member) => {
                const isCurrentUser = member.user_id === currentUserId;
                const isOwnerMember = member.user_id === tournament.owner_id;
                const displayName = member.display_name || member.email || member.user_id.slice(0, 8) + '...';

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between px-4 py-4 border-b border-muted/30 last:border-0"
                  >
                    {/* User info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg flex-shrink-0">
                        {getRoleEmoji(member.role)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {displayName}
                          {isCurrentUser && <span className="text-muted-foreground"> (you)</span>}
                        </p>
                        <Badge className={`text-xs ${getRoleBadgeColor(member.role)}`}>
                          {member.role}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    {isAdmin && !isCurrentUser && !isOwnerMember && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {member.role === 'viewer' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs text-green-400"
                            disabled={loading === member.id}
                            onClick={() => changeRole(member.id, member.user_id, 'admin')}
                          >
                            → Admin
                          </Button>
                        )}
                        {member.role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs text-blue-400"
                            disabled={loading === member.id}
                            onClick={() => changeRole(member.id, member.user_id, 'viewer')}
                          >
                            → Viewer
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-xs text-red-400"
                          disabled={loading === member.id}
                          onClick={() => removeMember(member.id, member.user_id)}
                        >
                          ✕
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Role Explanation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span>👑</span>
              <span className="font-medium">Owner</span>
              <span className="text-muted-foreground">— Full control, can delete tournament</span>
            </div>
            <div className="flex items-center gap-2">
              <span>⚡</span>
              <span className="font-medium">Admin</span>
              <span className="text-muted-foreground">— Record scores, manage schedule</span>
            </div>
            <div className="flex items-center gap-2">
              <span>👁️</span>
              <span className="font-medium">Viewer</span>
              <span className="text-muted-foreground">— View matches and standings</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}