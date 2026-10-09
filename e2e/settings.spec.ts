import { expect, test, type Page } from '@playwright/test';
import { SETTINGS_STORAGE_KEY, THRESHOLD_STORAGE_KEY } from '../src/config/constants';

// Settings panel (specs/in-app-configuration/prd2.md §7.3). The fake microphone loops a 440 Hz tone
// (concert A4 = written Si4, MIDI 71); see playwright.config.ts.

const gear = (page: Page) => page.getByRole('button', { name: 'Settings' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const scaleInput = (page: Page) => dialog(page).getByRole('combobox', { name: 'Scale' });
const setting = (page: Page, name: string) => dialog(page).getByRole('slider', { name });

async function expectDefaults(page: Page): Promise<void> {
  await expect(scaleInput(page)).toHaveValue('Do major');
  await expect(setting(page, 'Melody length')).toHaveAttribute('aria-valuetext', '5 notes');
  await expect(setting(page, 'Max interval')).toHaveAttribute('aria-valuetext', '12 semitones');
  await expect(setting(page, 'Note duration')).toHaveAttribute('aria-valuetext', '1000 ms');
  await expect(setting(page, 'Playback volume')).toHaveAttribute('aria-valuetext', '50%');
  await expect(dialog(page).getByText('5 notes')).toBeVisible();
  await expect(dialog(page).getByText('12 semitones')).toBeVisible();
  await expect(dialog(page).getByText('1000 ms')).toBeVisible();
  await expect(dialog(page).getByText('50%')).toBeVisible();
}

test('Home dialog: the gear opens it with the five defaults; Esc and Close close it', async ({ page }) => {
  await page.goto('/');
  await gear(page).click();
  await expect(dialog(page)).toBeVisible();
  // showModal focuses the dialog itself (autofocus), never the scale input: the list stays closed.
  await expect(dialog(page)).toBeFocused();
  await expect(scaleInput(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog(page).getByRole('listbox')).toHaveCount(0);
  await expectDefaults(page);
  await expect(dialog(page).getByRole('slider')).toHaveCount(4);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(gear(page)).toBeFocused();

  await gear(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(gear(page)).toBeFocused();
});

test('Persistence: settings and threshold are restored after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('slider', { name: 'Threshold' }).fill('-30');
  await expect(page.getByText('Threshold: −30 dB')).toBeVisible();

  await gear(page).click();
  await setting(page, 'Note duration').fill('750');
  await setting(page, 'Playback volume').fill('80');
  await setting(page, 'Melody length').fill('8');
  await scaleInput(page).click();
  await page.keyboard.type('bb major');
  await page.keyboard.press('Enter');
  await expect(scaleInput(page)).toHaveValue('Si♭ major');
  await dialog(page).getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await expect(page.getByText('Threshold: −30 dB')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Threshold' })).toHaveValue('-30');
  await gear(page).click();
  await expect(scaleInput(page)).toHaveValue('Si♭ major');
  await expect(setting(page, 'Note duration')).toHaveAttribute('aria-valuetext', '750 ms');
  await expect(setting(page, 'Playback volume')).toHaveAttribute('aria-valuetext', '80%');
  await expect(setting(page, 'Melody length')).toHaveAttribute('aria-valuetext', '8 notes');
  await expect(setting(page, 'Max interval')).toHaveAttribute('aria-valuetext', '12 semitones');

  const stored = await page.evaluate(
    ([settingsKey, thresholdKey]) => ({
      settings: JSON.parse(localStorage.getItem(settingsKey) ?? 'null') as unknown,
      threshold: JSON.parse(localStorage.getItem(thresholdKey) ?? 'null') as unknown,
    }),
    [SETTINGS_STORAGE_KEY, THRESHOLD_STORAGE_KEY],
  );
  expect(stored).toEqual({
    settings: { noteDurationMs: 750, melodyLength: 8, volume: 0.8, maxInterval: 12, scaleId: 'major:si-flat' },
    threshold: -30,
  });
});

test('Combobox: filtering, Esc closes only the list, English names select', async ({ page }) => {
  await page.goto('/');
  await gear(page).click();
  await scaleInput(page).click();
  await expect(page.getByRole('listbox', { name: 'Scales' }).getByRole('option')).toHaveCount(146);
  await page.keyboard.type('bb major');
  await expect(page.getByRole('listbox', { name: 'Scales' }).getByRole('option')).toHaveText([
    'Si♭ major',
    'Si♭ major pentatonic',
  ]);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await expect(scaleInput(page)).toHaveValue('Do major');

  await scaleInput(page).fill('f# dorian');
  await page.keyboard.press('Enter');
  await expect(scaleInput(page)).toHaveValue('Fa# dorian');
  await expect(page.getByRole('listbox')).toBeHidden();
});

test('Training mode: only duration and volume; changing them neither restarts nor loses progress', async ({ page }) => {
  await page.goto('/?melody=71,71,71,60,60');
  await page.getByRole('button', { name: 'Start training' }).click();
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByTestId(`note-box-${i}`)).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
  }
  await expect(page.getByTestId('note-box-3')).toHaveAttribute('data-state', 'active');

  await gear(page).click();
  await expect(dialog(page).getByRole('slider')).toHaveCount(2);
  await expect(setting(page, 'Note duration')).toBeVisible();
  await expect(setting(page, 'Playback volume')).toBeVisible();
  await expect(dialog(page).getByText('Other settings can be changed on the home screen.')).toBeVisible();
  await expect(dialog(page).getByRole('combobox')).toHaveCount(0);

  await setting(page, 'Note duration').fill('500');
  await setting(page, 'Playback volume').fill('20');
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toBeHidden();

  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByTestId(`note-box-${i}`)).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId(`note-box-${i}`)).toHaveText('Si4');
  }
  await expect(page.getByTestId('note-box-3')).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('training-status')).toHaveText('Your turn: play note 4 of 5');
});

test('8 boxes wrap onto two centered rows at phone width without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // Do4 (concert Si♭3) never matches the 440 Hz fake mic, so the exercise cannot complete before Give up.
  await page.goto('/?melody=60,60,60,60,60,60,60,60');
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.locator('[data-testid^="note-box-"]')).toHaveCount(8);

  const boxRects = async () => {
    const boxes = await Promise.all(
      Array.from({ length: 8 }, (_, i) => page.getByTestId(`note-box-${i}`).boundingBox()),
    );
    return boxes.map((box) => {
      if (!box) throw new Error('note box not visible');
      return box;
    });
  };
  /** Number of boxes on the first row; also checks equal widths and no horizontal scroll. */
  const firstRowCount = async () => {
    const rects = await boxRects();
    for (const rect of rects) expect(Math.abs(rect.width - rects[0].width)).toBeLessThan(0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    return rects.filter((rect) => Math.abs(rect.y - rects[0].y) < 1).length;
  };

  // 375 px: 5 + 3, box 5 below box 0.
  expect(await firstRowCount()).toBe(5);
  const rects = await boxRects();
  expect(rects[5].y).toBeGreaterThan(rects[0].y + rects[0].height / 2);
  const width375 = rects[0].width;
  // 320 px: 4 + 4, same box size floor (never shrinks below the minimum).
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await firstRowCount()).toBe(4);
  expect((await boxRects())[0].width).toBeCloseTo(width375, 0);
  // Desktop: all 8 on one row.
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await firstRowCount()).toBe(8);
  await page.setViewportSize({ width: 375, height: 812 });

  // Wait for listening (Give up is enabled only then), then leave.
  const giveUp = page.getByRole('button', { name: 'Give up' });
  await expect(giveUp).toBeEnabled({ timeout: 15_000 });
  await giveUp.click();
  await expect(page.getByRole('button', { name: 'Start training' })).toBeVisible();
});

test('Invalid storage falls back to the defaults', async ({ page }) => {
  await page.addInitScript(
    ([settingsKey, thresholdKey]) => {
      localStorage.setItem(settingsKey, '{oops');
      localStorage.setItem(thresholdKey, '"abc"');
    },
    [SETTINGS_STORAGE_KEY, THRESHOLD_STORAGE_KEY],
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start training' })).toBeEnabled();
  await expect(page.getByText('Threshold: −40 dB')).toBeVisible();
  await gear(page).click();
  await expectDefaults(page);
});

test('Tab from the open Scale list moves focus to Melody length, not the page body', async ({ page }) => {
  await page.goto('/');
  await gear(page).click();
  await scaleInput(page).click();
  await expect(dialog(page).getByRole('listbox', { name: 'Scales' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(setting(page, 'Melody length')).toBeFocused();
  await expect(dialog(page).getByRole('listbox')).toHaveCount(0);
  await expect(scaleInput(page)).toHaveValue('Do major');
});
