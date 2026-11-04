import { test, expect } from '@playwright/test';

test('appearance switch follows the system, persists overrides and synchronizes tabs', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  const appearance = page.getByRole('switch', { name: 'Switch to light mode' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(appearance).toHaveAttribute('aria-checked', 'true');
  await appearance.click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Switch to dark mode' })).toHaveAttribute('aria-checked', 'false');
  const other = await context.newPage();
  await other.goto('/login');
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click();
  await expect(other.locator('html')).toHaveClass(/dark/);
  await expect(other.getByRole('switch', { name: 'Switch to light mode' })).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => localStorage.removeItem('cis-theme'));
  await page.reload();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
});

for (const failure of ['blocked', 'quota']) {
  test(`appearance switch works with ${failure} storage`, async ({ page }) => {
    await page.addInitScript((kind) => {
      if (kind === 'blocked') {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
      } else {
        Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
      }
    }, failure);
    await page.goto('/login');
    const appearance = page.getByRole('switch', { name: 'Switch to dark mode' });
    await appearance.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('switch', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
}
