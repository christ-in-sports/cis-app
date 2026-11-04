import { test, expect } from '@playwright/test';

test('appearance follows the system, persists overrides and synchronizes tabs', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const appearance = page.getByLabel('Appearance', { exact: true });
  await expect(appearance).toHaveValue('system');
  await appearance.selectOption('light');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(appearance).toHaveValue('light');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  const other = await context.newPage();
  await other.goto('/login');
  await appearance.selectOption('dark');
  await expect(other.locator('html')).toHaveClass(/dark/);
  await expect(other.getByLabel('Appearance', { exact: true })).toHaveValue('dark');
  await appearance.selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
});

for (const failure of ['blocked', 'quota']) {
test(`appearance still works with ${failure} storage`, async ({ page }) => {
  await page.addInitScript((failure) => {
    if (failure === 'blocked') {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    } else {
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    }
  }, failure);
  await page.goto('/login');
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});
}
