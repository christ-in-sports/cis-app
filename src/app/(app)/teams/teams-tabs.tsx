import { SectionTabs } from '@/components/cis/section-tabs';

export function TeamsTabs({ archived, division }: { archived: boolean; division: 'juniors' | 'ambassadors' }) {
  return <SectionTabs label="Teams" items={[
    { href: '/teams', to: `/teams?view=current&division=${division}`, label: 'Current teams', current: !archived },
    { href: '/teams', to: `/teams?view=archive&division=${division}`, label: 'Archived teams', current: archived },
  ]} />;
}
