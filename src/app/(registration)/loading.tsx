import { BoardHeader } from '@/components/cis/board-shell';
import { RegistrationColumn } from '@/components/cis/registration-frame';
import { Sheet } from '@/components/cis/sheet';

/**
 * Shown inside the layout while a Registration page loads, so the board and the
 * nav stay put instead of the root loading screen's cream page replacing them.
 * Plain text, no spinner: the design system allows no animation beyond the press
 * states (`DESIGN_SYSTEM.md` §6).
 */
export default function RegistrationLoading() {
  return (
    <>
      <BoardHeader title="Registration" />
      <RegistrationColumn>
        <Sheet className="px-cis-5 py-cis-6">
          <p role="status" className="m-0 text-cis-base font-bold text-cis-ink-muted">
            Loading…
          </p>
        </Sheet>
      </RegistrationColumn>
    </>
  );
}
