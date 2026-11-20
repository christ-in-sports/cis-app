/**
 * `DivisionTabs`, from the design system's component inventory (`DESIGN_SYSTEM.md` §7).
 *
 * Juniors / Ambassadors, as `SheetTabs` joined to the sheet below
 * (`<Sheet joined>`). The division lives in the URL (`?division=`).
 */

import { SheetTabs } from '@/components/cis/sheet-tabs';

export type DivisionKey = 'juniors' | 'ambassadors';

const TABS: { key: DivisionKey; name: string; note: string }[] = [
  { key: 'juniors', name: 'Juniors', note: 'Ages 10–13' },
  { key: 'ambassadors', name: 'Ambassadors', note: 'Ages 14–18' },
];

export function DivisionTabs({
  value,
  hrefFor,
}: {
  value: DivisionKey;
  hrefFor: (division: DivisionKey) => string;
}) {
  return (
    <SheetTabs
      label="Division"
      value={value}
      tabs={TABS.map((tab) => ({ ...tab, href: hrefFor(tab.key) }))}
    />
  );
}
