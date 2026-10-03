import { expect, test } from '@playwright/test';

test('the level meter follows the fake microphone and resets when the test is turned off', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Test microphone' });
  const meter = page.getByRole('meter', { name: 'Microphone level' });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => Number(await meter.getAttribute('aria-valuenow')), { timeout: 5_000 })
    .toBeGreaterThan(-40);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(meter).toHaveAttribute('aria-valuenow', '-60');
});
