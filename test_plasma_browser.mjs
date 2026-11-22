/* Minimal Chromium smoke for real PlasmaTerm / Pyodide LUT interaction.
 * Run on a HTTP-served repo root; save desktop/mobile screenshots on success.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function verifySelection(expected, label) {
  const found = await page.locator('#lut-grid .lut-cell.is-selected').count();
  assert.equal(found, expected, label);
}
async function dragBetween(a, b) {
  const first = await page.locator('#lut-grid .lut-cell').nth(a).boundingBox();
  const last = await page.locator('#lut-grid .lut-cell').nth(b).boundingBox();
  assert.ok(first && last, 'palette grid cell coordinates must exist');
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 8 });
  await page.mouse.up();
}
try {
  await page.goto('http://127.0.0.1:8000/web/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Startup completes an asynchronous layout reset: opening LUT too early
  // can be overwritten even though the worker later becomes ready.
  await page.waitForFunction(() =>
    document.querySelector('#lut-grid')?.getAttribute('aria-disabled') === 'false',
  null, { timeout: 90000 });
  if (await page.locator('#lut-window').isHidden()) {
    await page.locator('#restore-lut').click();
  }
  await page.locator('#lut-grid').waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.locator('#lut-grid .lut-cell').count(), 256);
  await page.locator('#lut-all').click();
  await verifySelection(256, 'Select all');
  await page.locator('#lut-none').click();
  await verifySelection(0, 'Select none');

  await page.locator('#lut-select').click();
  await dragBetween(0, 17);
  await verifySelection(4, '2x2 rectangle drag');

  const original = await page.locator('#lut-grid .lut-field').first().inputValue();
  await page.locator('#lut-hex-a').fill('AA2200');
  await page.locator('#lut-hex-a').press('Tab');
  await page.locator('#lut-fill').click();
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), 'AA2200');
  await page.locator('#lut-undo').click();
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), original);
  await page.locator('#lut-redo').click();
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), 'AA2200');

  // Exercise editor mode switches, not simply button existence.
  await page.locator('#lut-brush').click();
  await page.locator('#lut-grid .lut-field').nth(35).click();
  await page.locator('#lut-pick').click();
  await page.locator('#lut-grid .lut-field').nth(35).click();
  assert.match(await page.locator('#lut-hex-a').inputValue(), /^[0-9A-F]{6}$/);

  // Bank switching must use the existing worker protocol (1 is a stored LUT).
  await page.locator('#lut-bank').selectOption('1');
  await page.waitForFunction(() => document.querySelector('#lut-window')?.dataset.lutSlot === '1', null, { timeout: 10000 });
  assert.ok(!errors.length, 'page errors: ' + errors.join('\n'));

  // The LUT window also edits a separate persistent UI skin. These writes
  // must re-colour CSS, not submit another setLut to the renderer.
  const rendererRevision = await page.locator('#terminal').getAttribute('data-lut-revision');
  await page.locator('#lut-target').selectOption('ui');
  assert.equal(await page.locator('#lut-window').getAttribute('data-lut-mode'), 'ui');
  const originalUi = await page.locator('#lut-grid .lut-field').first().inputValue();
  await page.locator('#lut-select').click();
  await page.locator('#lut-none').click();
  await page.locator('#lut-grid .lut-field').first().click();
  await page.locator('#lut-hex-a').fill('C0FFEE');
  await page.locator('#lut-hex-a').press('Tab');
  await page.locator('#lut-fill').click();
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), 'C0FFEE');
  assert.equal(await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--plasmaterm-ui-000')), '#C0FFEE');
  await page.locator('#lut-undo').click();
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), originalUi);
  await page.locator('#lut-redo').click();
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), 'C0FFEE');

  // Switching UI banks must not touch the plasma LUT bank or its revision.
  await page.locator('#lut-bank').selectOption('1');
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), originalUi);
  await page.locator('#lut-bank').selectOption('0');
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), 'C0FFEE');
  assert.equal(await page.locator('#terminal').getAttribute('data-lut-revision'), rendererRevision);

  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/plasmaterm-winamp-modern-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#lut-window').evaluate((element) => {
    element.scrollTop = 0;
  });
  const box = await page.locator('#lut-grid').boundingBox();
  assert.ok(box && box.width > 100 && box.height > 100, 'mobile LUT grid remains visible');
  assert.equal(await page.locator('#lut-grid .lut-cell').count(), 256);
  await page.screenshot({ path: 'artifacts/plasmaterm-winamp-modern-mobile.png', fullPage: true });
  assert.ok(!errors.length, 'page errors: ' + errors.join('\n'));

  // Reload from actual browser localStorage, not a mocked controller.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--plasmaterm-ui-000')), '#C0FFEE');
  await page.waitForFunction(() =>
    document.querySelector('#lut-grid')?.getAttribute('aria-disabled') === 'false',
    null, { timeout: 90000 });
  if (await page.locator('#lut-window').isHidden())
    await page.locator('#restore-lut').click();
  await page.locator('#lut-target').selectOption('ui');
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), 'C0FFEE');
  // A recovery chord must work even if the skin colours become unreadable.
  await page.keyboard.press('Control+Shift+Alt+0');
  assert.equal(await page.locator('#lut-grid .lut-field').first().inputValue(), originalUi);
  assert.equal(await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--plasmaterm-ui-000')), '#' + originalUi);
  assert.ok(!errors.length, 'page errors: ' + errors.join('\n'));
  process.stdout.write('Browser smoke passed: live worker, 256 cells, rectangle selection, fill, undo/redo, brush, pick, bank switch, independent colourway editing, UI bank isolation, reload persistence, skin reset and desktop/mobile layout.\n');
} finally {
  await browser.close();
}
