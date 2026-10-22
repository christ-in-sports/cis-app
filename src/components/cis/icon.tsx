/**
 * `Icon`, from the design system's component inventory (`DESIGN_SYSTEM.md` §7).
 *
 * A thin wrapper over the Lucide glyph set so the system's stroke width lives in
 * one place: 2.75, line only, never filled, 24px in the app and 16px or 14px
 * (at weight 3) inside a chip or a button (§9). Emoji are never used as icons.
 *
 * Icons are looked up by name rather than imported at each call site, which is
 * what keeps the set small and the stroke consistent. A glyph that Lucide does
 * not have (the bracket) is drawn here, in the same stroke, so it sits in the
 * same visual family.
 */

import {
  Archive,
  ArrowRight,
  Calendar,
  ChartNoAxesColumn,
  Check,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  House,
  Lock,
  Minus,
  Pencil,
  Plus,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Trophy,
  TriangleAlert,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';

interface GlyphProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

/** Two games feeding one: the bracket glyph from the Sports designs. */
function Bracket({ size = 24, strokeWidth = 2.75, className, ...rest }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M3 5h6v5h4M3 19h6v-5h4M13 12h8" />
    </svg>
  );
}

const GLYPHS = {
  home: House,
  archive: Archive,
  qr: QrCode,
  standings: ChartNoAxesColumn,
  schedule: Calendar,
  bracket: Bracket,
  manage: SlidersHorizontal,
  // Registration section nav.
  register: UserPlus,
  roster: Users,
  import: Upload,
  servants: ClipboardList,
  roles: ShieldCheck,
  sports: Trophy,
  lock: Lock,
  check: Check,
  plus: Plus,
  minus: Minus,
  close: X,
  edit: Pencil,
  trash: Trash2,
  warning: TriangleAlert,
  arrow: ArrowRight,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
} satisfies Record<string, ComponentType<GlyphProps>>;

export type IconName = keyof typeof GLYPHS;

export function Icon({
  name,
  size = 24,
  strokeWidth = 2.75,
  className,
}: {
  name: IconName;
  /** 24 in the app, 16 in a button, 14 (weight 3) in a chip. */
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Glyph = GLYPHS[name];
  // Decorative: the control that holds it carries the accessible name.
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
