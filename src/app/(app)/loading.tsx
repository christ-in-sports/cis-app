import { RegistrationColumn } from '@/components/cis/registration-frame';
import { Sheet } from '@/components/cis/sheet';

/**
 * Shown inside the app shell while a page loads, so the board and the bottom bar
 * stay put instead of the root loading screen's cream page replacing them.
 * Plain text, no spinner: the design system allows no animation beyond the press
 * states (`DESIGN_SYSTEM.md` §6).
 */
export default function AppLoading() {
  return (
    <RegistrationColumn className="pt-cis-6">
      <Sheet className="px-cis-5 py-cis-6">
        <p role="status" className="m-0 text-cis-base font-bold text-cis-ink-muted">
          Loading…
        </p>
      </Sheet>
    </RegistrationColumn>
  );
}
