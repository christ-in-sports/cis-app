'use client';

/**
 * The action list under a block's tracker. Fixture, bracket and completion
 * actions run right here and report what they did in a result strip; scheduling,
 * clearing and resetting open their own screens because each asks for input or a
 * confirmation. An action that is not open says why, in words, under it.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { PrimaryButton, SecondaryButton, dangerButtonClasses, primaryButtonClasses, secondaryButtonClasses } from '@/components/cis/button';
import { Icon } from '@/components/cis/icon';
import { ActionNote, ResultStrip } from '@/components/cis/manage-parts';
import { FieldError } from '@/components/cis/form';
import { fixturePreview, type ManageActions } from '@/lib/competition/manage';
import type { BlockRecord } from '@/lib/competition/types';
import { plural } from '@/lib/competition/labels';

import { completeSportBlock, generateKnockout, generateLeagueFixtures } from '../actions';

type Key = 'schedule' | 'knockout' | 'complete' | 'generate';

export function ActionsPanel({
  blockId,
  format,
  actions,
  primary,
  preview,
  viewPlaces,
}: {
  blockId: string;
  format: BlockRecord['format'];
  actions: ManageActions;
  primary: Key;
  preview: { block: Pick<BlockRecord, 'format' | 'league_structure'>; teamCount: number } | null;
  viewPlaces: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<{ ok: true; games?: number } | { ok: false; error: string }>, say: (games?: number) => string) =>
    start(async () => {
      setError(null);
      setDone(null);
      const result = await job();
      if (!result.ok) return setError(result.error);
      setDone(say('games' in result ? result.games : undefined));
      router.refresh();
    });

  const generate = () =>
    run(
      () => (format === 'knockout' ? generateKnockout({ blockId }) : generateLeagueFixtures({ blockId })),
      (n) => `${plural(n ?? 0, format === 'knockout' ? 'game' : 'fixture')} generated. None are scheduled yet.`
    );

  const open = (k: Key, label: string, onClick: () => void) =>
    k === primary ? (
      <PrimaryButton block disabled={pending} onClick={onClick}>
        {pending ? 'Working…' : label}
      </PrimaryButton>
    ) : (
      <SecondaryButton block disabled={pending} onClick={onClick}>
        {label}
      </SecondaryButton>
    );

  const row = (key: string, state: { shown: boolean; enabled: boolean; why: string | null }, control: React.ReactNode) =>
    state.shown ? (
      <div key={key} className="pt-3">
        {control}
        {state.why ? <ActionNote locked={!state.enabled}>{state.why}</ActionNote> : null}
      </div>
    ) : null;

  const linkClass = (k: Key) => `${k === primary ? primaryButtonClasses : secondaryButtonClasses} w-full`;
  const locked = (label: string, k: Key = 'generate') =>
    k === primary ? (
      <PrimaryButton block disabled>
        {label}
      </PrimaryButton>
    ) : (
      <SecondaryButton block disabled>
        {label}
      </SecondaryButton>
    );

  return (
    <div className="pb-1">
      {done ? (
        <div className="pt-3">
          <ResultStrip>{done}</ResultStrip>
        </div>
      ) : null}
      {error ? (
        <div className="pt-3">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}

      {row(
        'generate',
        actions.generate,
        actions.generate.enabled ? open('generate', actions.generate.label, generate) : locked(actions.generate.label)
      )}
      {preview && actions.generate.enabled ? <ActionNote>{fixturePreview(preview.block, preview.teamCount)}</ActionNote> : null}

      {row(
        'schedule',
        actions.schedule,
        actions.schedule.enabled ? (
          <Link href={`/sports/manage/${blockId}/schedule`} className={linkClass('schedule')}>
            Schedule a game day
          </Link>
        ) : (
          locked('Schedule a game day', 'schedule')
        )
      )}
      {row(
        'clear',
        actions.clear,
        actions.clear.enabled ? (
          <Link href={`/sports/manage/${blockId}/clear`} className={`${secondaryButtonClasses} w-full`}>
            Clear a game day
          </Link>
        ) : (
          <SecondaryButton block disabled>
            Clear a game day
          </SecondaryButton>
        )
      )}
      {row(
        'knockout',
        actions.knockout,
        actions.knockout.enabled ? (
          open('knockout', 'Generate knockout', () => run(() => generateKnockout({ blockId }), (n) => `Knockout generated. ${plural(n ?? 0, 'game')}, none scheduled yet.`))
        ) : (
          locked('Generate knockout', 'knockout')
        )
      )}
      {row(
        'complete',
        actions.complete,
        actions.complete.enabled ? (
          open('complete', 'Complete block', () => run(() => completeSportBlock({ blockId }), () => 'Block completed. Final places are published.'))
        ) : (
          locked('Complete block', 'complete')
        )
      )}

      {viewPlaces ? (
        <div className="pt-3">
          <Link href={viewPlaces} className={`${secondaryButtonClasses} w-full`}>
            View final places
          </Link>
        </div>
      ) : null}

      {actions.reset.shown ? (
        <div className="mt-4 border-t-[5px] border-cis-ink-dark pt-4">
          <Link
            href={`/sports/manage/${blockId}/reset`}
            className={`${dangerButtonClasses} w-full`}
          >
            <Icon name="trash" size={16} strokeWidth={3} />
            Reset block
          </Link>
          {viewPlaces ? <ActionNote locked>Deletes every game, result and final place in this block.</ActionNote> : null}
        </div>
      ) : null}
    </div>
  );
}
