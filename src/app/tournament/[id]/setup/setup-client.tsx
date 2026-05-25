'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

interface Tournament {
  id: string;
  name: string;
  team_count: number;
  share_code: string;
  status: string;
}

interface Team {
  id: string;
  name: string;
  color: string;
  seed: number;
}

interface Sport {
  id: string;
  sport_type: string;
  play_mode: string;
  settings: any;
}

const SPORT_TYPES = [
  { key: 'soccer', label: 'Soccer', emoji: '⚽' },
  { key: 'basketball', label: 'Basketball', emoji: '🏀' },
  { key: 'volleyball', label: 'Volleyball', emoji: '🏐' },
  { key: 'dodgeball', label: 'Dodgeball', emoji: '🤾' },
];

const PLAY_MODES = [
  { key: 'league', label: 'League Only', desc: 'Round-robin, everyone plays everyone' },
  { key: 'tournament', label: 'Tournament Only', desc: 'Single elimination bracket' },
  { key: 'league_tournament', label: 'League + Tournament', desc: 'Group stage then knockout' },
];

const TEAM_COLORS = [
  // Reds
  '#EF4444', // red
  '#DC2626', // dark red
  '#F87171', // light red
  '#B91C1C', // crimson
  // Oranges
  '#F97316', // orange
  '#EA580C', // dark orange
  '#FB923C', // light orange
  // Yellows
  '#EAB308', // yellow
  '#CA8A04', // dark yellow
  '#FBBF24', // gold
  '#FDE047', // light yellow
  // Greens
  '#22C55E', // green
  '#16A34A', // dark green
  '#4ADE80', // light green
  '#10B981', // emerald
  '#059669', // teal green
  '#34D399', // mint
  // Blues
  '#3B82F6', // blue
  '#2563EB', // dark blue
  '#60A5FA', // light blue
  '#06B6D4', // cyan
  '#0891B2', // dark cyan
  '#38BDF8', // sky
  '#1D4ED8', // royal blue
  '#6366F1', // indigo
  // Purples
  '#8B5CF6', // purple
  '#7C3AED', // dark purple
  '#A78BFA', // lavender
  '#C084FC', // light purple
  '#9333EA', // violet
  // Pinks
  '#EC4899', // pink
  '#DB2777', // dark pink
  '#F472B6', // light pink
  '#F43F5E', // rose
  '#E11D48', // crimson rose
  // Neutrals
  '#FFFFFF', // white
  '#94A3B8', // slate
  '#6B7280', // gray
  '#1E293B', // dark navy
  '#000000', // black
];

const DEFAULT_SETTINGS: Record<string, any> = {
  soccer: { half_duration_min: 7, final_half_duration_min: 10 },
  basketball: { half_duration_min: 7, final_half_duration_min: 10 },
  volleyball: { sets_to_win: 2, max_sets: 5, points_per_set: 25, final_set_points: 15, final_max_sets: 5, final_sets_to_win: 3 },
  dodgeball: { rounds_to_win: 2, max_rounds: 5, final_max_rounds: 5, final_rounds_to_win: 3 },
};

export default function SetupClient({
  tournament,
  existingTeams,
  existingSports,
  userId,
}: {
  tournament: Tournament;
  existingTeams: Team[];
  existingSports: Sport[];
  userId: string;
}) {
  const [step, setStep] = useState(existingTeams.length > 0 ? 2 : 1);
  const [colorPickerOpen, setColorPickerOpen] = useState<number | null>(null);
  const [teams, setTeams] = useState<{ name: string; color: string }[]>(
    existingTeams.length > 0
      ? existingTeams.map((t) => ({ name: t.name, color: t.color }))
      : Array.from({ length: tournament.team_count }, (_, i) => ({
          name: '',
          color: TEAM_COLORS[i % TEAM_COLORS.length],
        }))
  );
  const [sportConfigs, setSportConfigs] = useState<Record<string, { play_mode: string; settings: any }>>(
    existingSports.length > 0
      ? Object.fromEntries(existingSports.map((s) => [s.sport_type, { play_mode: s.play_mode, settings: s.settings }]))
      : Object.fromEntries(SPORT_TYPES.map((s) => [s.key, { play_mode: 'league_tournament', settings: DEFAULT_SETTINGS[s.key] }]))
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  // Step 1: Team Names
  const updateTeamName = (index: number, name: string) => {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, name } : t)));
  };

  const updateTeamColor = (index: number, color: string) => {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, color } : t)));
  };

  const randomizeOrder = () => {
    setTeams((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  const saveTeams = async () => {
    const emptyTeams = teams.filter((t) => !t.name.trim());
    if (emptyTeams.length > 0) {
      toast({ title: 'Error', description: 'All team names are required', variant: 'destructive' });
      return;
    }

    setLoading(true);

    // Delete existing teams
    await supabase.from('teams').delete().eq('tournament_id', tournament.id);

    // Insert new teams with randomized seeds
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const { error } = await supabase.from('teams').insert(
      shuffled.map((t, i) => ({
        tournament_id: tournament.id,
        name: t.name.trim(),
        color: t.color,
        seed: i + 1,
      }))
    );

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Teams saved!', description: 'Seeds have been randomized' });
      setStep(2);
    }
    setLoading(false);
  };

  // Step 2: Sport Configuration
  const updateSportMode = (sport: string, play_mode: string) => {
    setSportConfigs((prev) => ({
      ...prev,
      [sport]: { ...prev[sport], play_mode },
    }));
  };

  const updateSportSetting = (sport: string, key: string, value: number) => {
    setSportConfigs((prev) => ({
      ...prev,
      [sport]: {
        ...prev[sport],
        settings: { ...prev[sport].settings, [key]: value },
      },
    }));
  };

  const saveSportsAndFinish = async () => {
    setLoading(true);

    // Delete existing sports
    await supabase.from('sports').delete().eq('tournament_id', tournament.id);

    // Insert sport configs
    const { error } = await supabase.from('sports').insert(
      SPORT_TYPES.map((s) => ({
        tournament_id: tournament.id,
        sport_type: s.key,
        play_mode: sportConfigs[s.key].play_mode,
        settings: sportConfigs[s.key].settings,
      }))
    );

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Update tournament status to active
    await supabase
      .from('tournaments')
      .update({ status: 'active', current_sport: 'soccer' })
      .eq('id', tournament.id);

    toast({ title: 'Tournament ready!', description: 'Redirecting to tournament...' });
    router.push(`/tournament/${tournament.id}`);
    router.refresh();
  };

  return (
    <div className="min-h-screen p-4 pb-32 safe-top safe-bottom max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold mt-2">{tournament.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline">Code: {tournament.share_code}</Badge>
          <Badge variant="outline">{tournament.team_count} teams</Badge>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`flex-1 h-1 rounded ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
        <div className={`flex-1 h-1 rounded ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
      </div>

      {/* Step 1: Teams */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Enter Team Names</h2>
            <Button variant="outline" size="sm" onClick={randomizeOrder}>
              🎲 Shuffle
            </Button>
          </div>

          {teams.map((team, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-lg border-2 cursor-pointer flex-shrink-0 transition-transform hover:scale-110 ${
                    colorPickerOpen === i ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: team.color }}
                  onClick={() => setColorPickerOpen(colorPickerOpen === i ? null : i)}
                />
                <Input
                  placeholder={`Team ${i + 1}`}
                  value={team.name}
                  onChange={(e) => updateTeamName(i, e.target.value)}
                  className="h-12 text-base"
                />
              </div>

              {/* Color Picker Grid */}
              {colorPickerOpen === i && (
                <div className="bg-muted/50 rounded-xl p-3 border border-muted">
                  <div className="grid grid-cols-8 gap-2">
                    {TEAM_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          updateTeamColor(i, color);
                          setColorPickerOpen(null);
                        }}
                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-125 ${
                          team.color === color ? 'border-white scale-125' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <p className="text-xs text-muted-foreground text-center">
            Tap the color square to pick a team color
          </p>

          <Button onClick={saveTeams} className="w-full h-12 text-base" disabled={loading}>
            {loading ? 'Saving...' : 'Save Teams & Continue'}
          </Button>
        </div>
      )}

      {/* Step 2: Sport Config */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Configure Sports</h2>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              ← Teams
            </Button>
          </div>

          {SPORT_TYPES.map((sport) => (
            <Card key={sport.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {sport.emoji} {sport.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Play Mode */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Play Mode</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {PLAY_MODES.map((mode) => (
                      <button
                        key={mode.key}
                        onClick={() => updateSportMode(sport.key, mode.key)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          sportConfigs[sport.key]?.play_mode === mode.key
                            ? 'border-primary bg-primary/10'
                            : 'border-muted hover:border-muted-foreground/50'
                        }`}
                      >
                        <p className="text-sm font-medium">{mode.label}</p>
                        <p className="text-xs text-muted-foreground">{mode.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sport-specific settings */}
                <div className="space-y-3 pt-2 border-t border-muted">
                  <Label className="text-xs text-muted-foreground">Settings</Label>

                  {(sport.key === 'soccer' || sport.key === 'basketball') && (
                    <>
                      {/* Regular half duration */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Half duration (min)</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateSportSetting(
                                sport.key,
                                'half_duration_min',
                                Math.max(3, (sportConfigs[sport.key]?.settings?.half_duration_min || 7) - 1)
                              )
                            }
                          >
                            −
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {sportConfigs[sport.key]?.settings?.half_duration_min || 7}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateSportSetting(
                                sport.key,
                                'half_duration_min',
                                (sportConfigs[sport.key]?.settings?.half_duration_min || 7) + 1
                              )
                            }
                          >
                            +
                          </Button>
                        </div>
                      </div>

                      {/* Final half duration */}
                      <div className="flex items-center justify-between bg-muted/30 p-2 rounded-lg">
                        <span className="text-sm">🏆 Final half (min)</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateSportSetting(
                                sport.key,
                                'final_half_duration_min',
                                Math.max(3, (sportConfigs[sport.key]?.settings?.final_half_duration_min || 10) - 1)
                              )
                            }
                          >
                            −
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {sportConfigs[sport.key]?.settings?.final_half_duration_min || 10}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateSportSetting(
                                sport.key,
                                'final_half_duration_min',
                                (sportConfigs[sport.key]?.settings?.final_half_duration_min || 10) + 1
                              )
                            }
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {sport.key === 'volleyball' && (
                    <>
                      {/* Regular sets */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Best of (sets)</span>
                        <div className="flex gap-2">
                          {[3, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => {
                                updateSportSetting(sport.key, 'max_sets', n);
                                updateSportSetting(sport.key, 'sets_to_win', Math.ceil(n / 2));
                              }}
                              className={`px-3 py-1 rounded text-sm ${
                                sportConfigs[sport.key]?.settings?.max_sets === n
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Points per set */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Points per set</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateSportSetting(
                                sport.key,
                                'points_per_set',
                                Math.max(15, (sportConfigs[sport.key]?.settings?.points_per_set || 25) - 5)
                              )
                            }
                          >
                            −
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {sportConfigs[sport.key]?.settings?.points_per_set || 25}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateSportSetting(
                                sport.key,
                                'points_per_set',
                                (sportConfigs[sport.key]?.settings?.points_per_set || 25) + 5
                              )
                            }
                          >
                            +
                          </Button>
                        </div>
                      </div>

                      {/* Final sets */}
                      <div className="flex items-center justify-between bg-muted/30 p-2 rounded-lg">
                        <span className="text-sm">🏆 Final best of</span>
                        <div className="flex gap-2">
                          {[3, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => {
                                updateSportSetting(sport.key, 'final_max_sets', n);
                                updateSportSetting(sport.key, 'final_sets_to_win', Math.ceil(n / 2));
                              }}
                              className={`px-3 py-1 rounded text-sm ${
                                sportConfigs[sport.key]?.settings?.final_max_sets === n
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {sport.key === 'dodgeball' && (
                    <>
                      {/* Regular rounds */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Best of (rounds)</span>
                        <div className="flex gap-2">
                          {[3, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => {
                                updateSportSetting(sport.key, 'max_rounds', n);
                                updateSportSetting(sport.key, 'rounds_to_win', Math.ceil(n / 2));
                              }}
                              className={`px-3 py-1 rounded text-sm ${
                                sportConfigs[sport.key]?.settings?.max_rounds === n
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Final rounds */}
                      <div className="flex items-center justify-between bg-muted/30 p-2 rounded-lg">
                        <span className="text-sm">🏆 Final best of</span>
                        <div className="flex gap-2">
                          {[3, 5, 7].map((n) => (
                            <button
                              key={n}
                              onClick={() => {
                                updateSportSetting(sport.key, 'final_max_rounds', n);
                                updateSportSetting(sport.key, 'final_rounds_to_win', Math.ceil(n / 2));
                              }}
                              className={`px-3 py-1 rounded text-sm ${
                                sportConfigs[sport.key]?.settings?.final_max_rounds === n
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          <Button onClick={saveSportsAndFinish} className="w-full h-12 text-base" disabled={loading}>
            {loading ? 'Setting up...' : '🏆 Start Tournament'}
          </Button>
        </div>
      )}
    </div>
  );
}