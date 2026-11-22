import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOURWAY_MAGIC, COLOURWAY_SIZE, COLOURWAY_STORAGE_KEY,
  buildColourwayCatalog, rewriteColourwayCss, normalizeColour,
  encodeColourway, decodeColourway, createColourwayController,
} from './web/plasma-colourway.mjs';

const css = [
  ':root { --accent: #abc; color: #112233; }',
  '.win { border-color: #112233; box-shadow: 0 1px 2px #ABC8; }',
  '.control { background: linear-gradient(#123456, #11223380); }',
].join('\n');

function harness(source = css, stored = null, search = '') {
  const items = new Map();
  const stylesheet = { textContent: source };
  const root = { dataset: {}, style: { setProperty: (key, value) => items.set(key, value) } };
  const memory = new Map(stored ? [[COLOURWAY_STORAGE_KEY, stored]] : []);
  const storage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
  };
  const controller = createColourwayController({ stylesheet, root, storage, search });
  return { controller, stylesheet, root, items, memory, storage };
}

test('CSS swatches map distinct RGB while sharing repeats and preserving alpha', () => {
  const c = buildColourwayCatalog(css);
  assert.equal(c.count, 4);
  assert.deepEqual(c.defaultPalette.slice(0, 4),
    ['AABBCC', '112233', '123456', '112233'].filter((v, i, arr) => arr.indexOf(v) === i));
  assert.equal(c.defaultPalette.length, COLOURWAY_SIZE);
  assert.deepEqual(c.entries.find((e) => e.original === 'AABBCC').alphas, [136]);
  const rewritten = rewriteColourwayCss(css, c);
  assert.match(rewritten, /var\(--plasmaterm-ui-000, #abc\)/);
  assert.match(rewritten, /var\(--plasmaterm-ui-000-a136, #ABC8\)/);
  assert.match(rewritten, /var\(--plasmaterm-ui-001-a128, #11223380\)/);
  assert.equal((rewritten.match(/var\(--plasmaterm-ui-001/g) || []).length, 3);
});

test('interface colourway never writes to renderer and applies alpha separately', () => {
  const h = harness();
  const { controller, items } = h;
  assert.equal(controller.catalog.count, 3);
  assert.equal(controller.state().slot, '0');
  const first = controller.getPalette();
  first[0] = 'FF0000';
  assert.equal(controller.replacePalette(first), true);
  assert.equal(items.get('--plasmaterm-ui-000'), '#FF0000');
  assert.equal(items.get('--plasmaterm-ui-000-a136'), 'rgba(255,0,0,0.53333)');
  assert.equal(items.get('--plasmaterm-ui-001'), '#112233');
  assert.equal(controller.state().colors.length, 256);
  assert.ok(h.memory.get(COLOURWAY_STORAGE_KEY));
});

test('ten independent banks persist and the active bank can be reset', () => {
  const h = harness();
  const first = h.controller.getPalette();
  first[1] = 'ABC123';
  h.controller.replacePalette(first);
  assert.ok(h.controller.selectBank(9));
  assert.equal(h.controller.getPalette()[1], '112233');
  const ninth = h.controller.getPalette();
  ninth[1] = '999999';
  h.controller.replacePalette(ninth);
  assert.equal(h.controller.selectBank(0), true);
  assert.equal(h.controller.getPalette()[1], 'ABC123');
  const reopened = harness(css, h.memory.get(COLOURWAY_STORAGE_KEY));
  assert.equal(reopened.controller.getPalette()[1], 'ABC123');
  assert.equal(reopened.controller.selectBank(9), true);
  assert.equal(reopened.controller.getPalette()[1], '999999');
  reopened.controller.resetActiveBank();
  assert.equal(reopened.controller.getPalette()[1], '112233');
  assert.equal(reopened.controller.selectBank(10), false);
});

test('exported colourways remain mapped by original CSS colour across CSS reorder', () => {
  const h = harness();
  const palette = h.controller.getPalette();
  palette[0] = 'FF00BB';
  palette[1] = 'C0FFEE';
  palette[255] = 'EEDDCC';
  assert.equal(h.controller.replacePalette(palette), true);
  const exported = h.controller.exportCurrent();
  assert.equal(JSON.parse(exported).format, COLOURWAY_MAGIC);
  const swappedCss = '.a { color: #112233; background: #123456; }\n.b { border: #abc; }';
  const other = harness(swappedCss);
  const imported = other.controller.parseImport(exported);
  assert.ok(imported);
  assert.equal(imported[other.controller.catalog.byOriginal.get('AABBCC')], 'FF00BB');
  assert.equal(imported[other.controller.catalog.byOriginal.get('112233')], 'C0FFEE');
  assert.equal(imported[255], 'EEDDCC');
  assert.equal(decodeColourway('invalid', other.controller.catalog), null);
  assert.equal(normalizeColour('#A1b2c3'), 'A1B2C3');
  assert.equal(encodeColourway(other.controller.catalog, imported).includes(COLOURWAY_MAGIC), true);
});

test('malformed storage fails closed and ?skin-default recovers from stored override', () => {
  const bad = JSON.stringify({ version: 1, activeBank: 0,
    banks: { 0: { overrides: { '112233': 'nothex' }, extras: ['ZZZZZZ'] } } });
  assert.equal(harness(css, bad).controller.getPalette()[1], '112233');
  const h = harness();
  const altered = h.controller.getPalette();
  altered[1] = '000000';
  h.controller.replacePalette(altered);
  const safe = harness(css, h.memory.get(COLOURWAY_STORAGE_KEY), '?skin-default=1');
  assert.equal(safe.controller.getPalette()[1], '112233');
});

test('the supplied browser stylesheet has a 256-colour coverage budget', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./web/index.html', import.meta.url), 'utf8');
  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(style, 'source must have a dedicated, convertible stylesheet');
  const c = buildColourwayCatalog(style[1]);
  assert.ok(c.count >= 150, 'the entire chrome palette must be included');
  assert.ok(c.count < 256, 'reserved colourway swatches remain available');
  const rewritten = rewriteColourwayCss(style[1], c);
  assert.ok(rewritten.includes('var(--plasmaterm-ui-'));
});
