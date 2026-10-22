'use client';

import { PrimaryButton } from '@/components/cis/button';

export function PrintCodesButton() {
  return <PrimaryButton onClick={() => window.print()}>Print QR cards</PrimaryButton>;
}
