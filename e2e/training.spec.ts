import { expect, test } from '@playwright/test';

// The fake microphone loops a 440 Hz tone (concert A4 = written Si4, MIDI 71); see playwright.config.ts.
// The reveal overlay lives for only NOTE_REVEAL_MS (1 s): wait for it and check it in the page in one step
// (page.waitForFunction / locator.waitFor poll in the page), never with expect(...) retries or a
// separate round trip after the wait.

test('a melody matching the fake tone is completed, each note revealed, and returns Home', async ({ page }) => {
  await page.goto('/?melody=71,71,71,71,71');
  await page.getByRole('button', { name: 'Start training' }).click();

  await expect(page.getByTestId('note-box-0')).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('button', { name: 'Repeat melody' })).toBeDisabled();
  await expect(page.getByTestId('pitch-graph')).toBeVisible();

  const reveal = page.getByTestId('note-reveal');
  for (let i = 0; i < 5; i += 1) {
    // Waits for the card and checks its text in the same in-page poll.
    await page.waitForFunction(
      () => document.querySelector('[data-testid="note-reveal"]')?.textContent === 'Si4',
      null,
      { timeout: 15_000 },
    );
    await reveal.waitFor({ state: 'hidden' });
    const box = page.getByTestId(`note-box-${i}`);
    await expect(box).toHaveAttribute('data-state', 'done');
    await expect(box).toHaveText('Si4');
  }

  await expect(page.getByRole('button', { name: 'Start training' })).toBeVisible();
});

test('a wrong note turns the band red (kept through Repeat), never advances; Give up returns Home', async ({
  page,
}) => {
  await page.goto('/?melody=60,60,60,60,60');
  await page.getByRole('button', { name: 'Start training' }).click();
  const graph = page.getByTestId('pitch-graph');

  await expect(graph).toHaveAttribute('data-band-state', 'red', { timeout: 15_000 });
  await expect(page.getByTestId('note-box-0')).toHaveAttribute('data-state', 'active');
  await expect(page.locator('[data-state="done"]')).toHaveCount(0);
  await expect(page.getByTestId('note-reveal')).toHaveCount(0);

  await page.getByRole('button', { name: 'Repeat melody' }).click();
  await expect(page.getByTestId('training-status')).toHaveText('Listen…');
  await expect(graph).toHaveAttribute('data-band-state', 'red');
  await expect(page.getByRole('button', { name: 'Repeat melody' })).toBeEnabled({ timeout: 15_000 });
  await expect(graph).toHaveAttribute('data-band-state', 'red');
  await expect(page.locator('[data-state="done"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByRole('button', { name: 'Start training' })).toBeVisible();
});

test('Give up stays clickable through the reveal overlay', async ({ page }) => {
  await page.goto('/?melody=71,60,60,60,60');
  await page.getByRole('button', { name: 'Start training' }).click();

  // Waits for the card and hit-tests the Give up centre in the same in-page poll (the card lives 1 s).
  const hitsGiveUp = await page.waitForFunction(
    () => {
      if (document.querySelector('[data-testid="note-reveal"]') === null) return null;
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Give up');
      if (button === undefined) return null;
      const rect = button.getBoundingClientRect();
      return { hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button };
    },
    null,
    { timeout: 15_000 },
  );
  expect(await hitsGiveUp.jsonValue()).toEqual({ hit: true });

  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByRole('button', { name: 'Start training' })).toBeVisible();
});
