import { expect, test } from '@playwright/test';

// The fake microphone loops a 440 Hz tone (concert A4 = written Si4, MIDI 71); see playwright.config.ts.

test('a melody matching the fake tone is completed and returns Home', async ({ page }) => {
  await page.goto('/?melody=71,71,71,71,71');
  await page.getByRole('button', { name: 'Start training' }).click();

  await expect(page.getByTestId('note-box-0')).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('button', { name: 'Repeat melody' })).toBeDisabled();

  for (let i = 0; i < 5; i += 1) {
    const box = page.getByTestId(`note-box-${i}`);
    await expect(box).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
    await expect(box).toHaveText('Si4');
  }

  await expect(page.getByRole('button', { name: 'Start training' })).toBeVisible();
});

test('a melody that does not match the fake tone never advances; Give up returns Home', async ({ page }) => {
  await page.goto('/?melody=60,60,60,60,60');
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.getByTestId('note-box-0')).toBeVisible();

  await page.waitForTimeout(6_000);
  await expect(page.getByTestId('note-box-0')).toHaveAttribute('data-state', 'active');
  await expect(page.locator('[data-state="done"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByRole('button', { name: 'Start training' })).toBeVisible();
});
