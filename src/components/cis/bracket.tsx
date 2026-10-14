/**
 * The bracket on a phone: rounds stacked vertically, with jump chips and a
 * "Winner plays …" line standing in for connector lines (`BracketGame` and
 * `RoundJumpChips` in `DESIGN_SYSTEM.md` §7). Every game stays readable at full
 * size, and the line under each game says where its teams go next, which a tree
 * of lines would show only by shrinking to half size.
 *
 * A bye is a labelled row in the round the team skips. Seed numbers are not shown:
 * seeds are not stored, so the bracket shows names only.
 */

import { Chip } from '@/components/cis/chip';
import { GameStateChip, TeamLineRow } from '@/components/cis/team-lines';
import type { BracketGameView, BracketSection } from '@/lib/competition/view';
import { jumpTargets } from '@/lib/competition/view';
import type { ReactNode } from 'react';

export function RoundJumpChips({ sections }: { sections: readonly BracketSection[] }) {
  return (
    <nav aria-label="Jump to a round" className="flex flex-wrap gap-2 pb-1">
      {jumpTargets(sections).map((t) => (
        <a
          key={t.id}
          href={`#round-${t.id}`}
          className="inline-flex min-h-cis-tap-min items-center rounded-cis-chip border-2 border-cis-ink px-3 text-cis-sm font-bold text-cis-ink"
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function BracketGame({ game, action }: { game: BracketGameView; action?: ReactNode }) {
  const showState = game.state !== 'final';
  return (
    <div className="border-b border-cis-rule py-3">
      <div className="mb-1 flex justify-between gap-2 text-cis-xs font-bold text-cis-ink-muted">
        <span>{game.label}</span>
        {game.when ? <span>{game.when}</span> : null}
      </div>
      <TeamLineRow line={game.home} />
      <TeamLineRow line={game.away} />
      {game.tiebreakNote ? (
        <div className="mt-1.5">
          <Chip variant="tint" size="s">
            {game.tiebreakNote}
          </Chip>
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-cis-xs font-bold text-cis-ink-muted">
        {showState ? <GameStateChip state={game.state} /> : null}
        {game.exit}
      </div>
      {action}
    </div>
  );
}

export function BracketBye({ team, goesTo }: { team: string; goesTo: string }) {
  return (
    <div className="border-b border-cis-rule py-3">
      <div className="mb-1 flex justify-between gap-2 text-cis-xs font-bold text-cis-ink-muted">
        <span>Bye</span>
        <span>Straight to {goesTo}</span>
      </div>
      <div className="text-cis-md font-bold leading-[1.35]">{team}</div>
    </div>
  );
}

export function BracketSectionView({
  section,
  first,
  renderAction,
}: {
  section: BracketSection;
  /** The first section has no heavy rule above it. */
  first: boolean;
  renderAction?: (game: BracketGameView) => ReactNode;
}) {
  return (
    <section
      id={`round-${section.id}`}
      aria-labelledby={`round-${section.id}-title`}
      className={first ? 'scroll-mt-4' : 'mt-3.5 scroll-mt-4 border-t-[5px] border-cis-ink-dark'}
    >
      <div className={`flex items-baseline justify-between gap-2.5 pb-1.5 ${first ? 'pt-1.5' : 'pt-[18px]'}`}>
        <h2 id={`round-${section.id}-title`} className="font-cis-display text-cis-lg font-normal leading-[1.15]">
          {section.title}
        </h2>
        <span className="text-cis-xs font-bold text-cis-ink-muted">
          {section.played} of {section.total} played
        </span>
      </div>
      {section.items.map((item) =>
        item.kind === 'bye' ? (
          <BracketBye key={`bye-${item.team}-${item.goesTo}`} team={item.team} goesTo={item.goesTo} />
        ) : (
          <BracketGame key={item.game.id} game={item.game} action={renderAction?.(item.game)} />
        ),
      )}
    </section>
  );
}
