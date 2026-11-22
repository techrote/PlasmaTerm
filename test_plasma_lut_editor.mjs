import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LUT_LENGTH, LUT_REGION_MAGIC, normalizeHex, validPalette,
  bounds, rectangle, selectionRectangle, makeRegion, encodeRegion, decodeRegion,
  pasteRegion, gradientPalette, transformPalette, varyPalette,
} from './web/plasma-lut-editor.mjs';

const palette = () => Array.from({ length: LUT_LENGTH }, (_, i) =>
  i.toString(16).padStart(6, '0').toUpperCase());

test('256 RRGGBB values remain the worker contract', () => {
  assert.equal(normalizeHex('#ab00ff'), 'AB00FF');
  assert.equal(normalizeHex('bad'), null);
  assert.ok(validPalette(palette()));
  assert.equal(validPalette(['FFFFFF']), false);
  assert.equal(validPalette(Array(LUT_LENGTH).fill('#ZFFFFF')), false);
});
test('selection modes retain absolute 16x16 spatial geometry', () => {
  assert.deepEqual(rectangle(0, 17), [0, 1, 16, 17]);
  assert.deepEqual(bounds([0, 17]), {
    minX: 0, maxX: 1, minY: 0, maxY: 1, width: 2, height: 2,
  });
  const base = new Set([0]);
  assert.deepEqual([...selectionRectangle(base, 17, 17, 'add')], [0, 17]);
  assert.deepEqual([...selectionRectangle(base, 0, 0, 'toggle')], []);
  assert.deepEqual([...selectionRectangle(new Set([0, 1]), 0, 0, 'subtract')], [1]);
  assert.deepEqual([...base], [0], 'selection modifiers must not mutate base');
});
test('sparse, shape-preserving regions round-trip with Xenofield clipboard', () => {
  const src = palette();
  const region = makeRegion(src, new Set([0, 17]));
  assert.deepEqual(region.mask, [true, false, false, true]);
  assert.deepEqual(region.colors, [src[0], null, null, src[17]]);
  const encoded = encodeRegion(region);
  assert.ok(encoded.startsWith(LUT_REGION_MAGIC + '\n'));
  assert.deepEqual(decodeRegion(encoded), region);
  assert.equal(decodeRegion(LUT_REGION_MAGIC + '\n{"width":17}'), null);
  assert.equal(decodeRegion('hello world'), null);
});
test('legacy 32 by 8 exported LUT is parsed as a full 16 by 16 bank', () => {
  const source = palette();
  const legacy = Array.from({ length: 32 }, (_, row) =>
    source.slice(row * 8, row * 8 + 8).join(', ')).join('\n');
  const region = decodeRegion(legacy);
  assert.equal(region.width, 16);
  assert.equal(region.height, 16);
  assert.deepEqual(region.colors, source);
  assert.equal(decodeRegion(legacy.replace('000010', 'not-hex')), null);
});
test('plain-text rectangular hex matrices preserve row layout', () => {
  const parsed = decodeRegion('AA0000 BB0000\nCC0000 DD0000');
  assert.equal(parsed.width, 2);
  assert.equal(parsed.height, 2);
  assert.deepEqual(parsed.colors, ['AA0000', 'BB0000', 'CC0000', 'DD0000']);
});
test('paste offsets, clips, tiles, and skips sparse holes', () => {
  const base = Array(LUT_LENGTH).fill('111111');
  const region = { width: 2, height: 2,
    colors: ['AAAAAA', null, null, 'BBBBBB'],
    mask: [true, false, false, true] };
  const offset = pasteRegion(base, region, [], 14 * 16 + 14);
  assert.equal(offset[14 * 16 + 14], 'AAAAAA');
  assert.equal(offset[15 * 16 + 15], 'BBBBBB');
  assert.equal(offset[14 * 16 + 15], '111111');
  const tiled = pasteRegion(base, region, [0, 1, 2, 16, 17, 18], 0);
  assert.equal(tiled[0], 'AAAAAA');
  assert.equal(tiled[1], '111111');
  assert.equal(tiled[2], 'AAAAAA');
  assert.equal(tiled[17], 'BBBBBB');
  assert.equal(tiled[18], '111111');
});
test('gradient directions and sparse selection do not affect other cells', () => {
  const original = Array(LUT_LENGTH).fill('777777');
  const horizontal = gradientPalette(original, [], 'horizontal', '000000', 'FFFFFF');
  assert.equal(horizontal[0], '000000');
  assert.equal(horizontal[15], 'FFFFFF');
  const vertical = gradientPalette(original, [], 'vertical', '000000', 'FFFFFF');
  assert.equal(vertical[0], '000000');
  assert.equal(vertical[240], 'FFFFFF');
  const diagonal = gradientPalette(original, [], 'diagonal', '000000', 'FFFFFF');
  assert.equal(diagonal[0], '000000');
  assert.equal(diagonal[255], 'FFFFFF');
  const sparse = gradientPalette(original, [0, 2], 'horizontal', '000000', 'FFFFFF');
  assert.equal(sparse[1], '777777');
  assert.equal(sparse[2], 'FFFFFF');
  const radial = gradientPalette(original, [0, 1, 16, 17], 'radial', '000000', 'FFFFFF');
  assert.equal(radial[0], 'FFFFFF'); // corners of 2x2 are the outer radial shell
});
test('flips and 180 rotation preserve the region footprint', () => {
  const src = palette();
  const horizontal = transformPalette(src, [0, 1, 2], 'flip-h');
  assert.equal(horizontal[0], src[2]);
  assert.equal(horizontal[2], src[0]);
  assert.equal(horizontal[3], src[3]);
  const vertical = transformPalette(src, [0, 16], 'flip-v');
  assert.equal(vertical[0], src[16]);
  const rotated = transformPalette(src, [0, 1, 16, 17], 'rotate-180');
  assert.equal(rotated[0], src[17]);
  assert.equal(rotated[1], src[16]);
  assert.equal(rotated[255], src[255]);
});
test('cyclic eight-anchor generator blends by selected strength', () => {
  const src = Array(LUT_LENGTH).fill('000000');
  assert.deepEqual(varyPalette(src, 0, () => 1), src);
  assert.deepEqual(varyPalette(src, 100, () => 0.5), Array(LUT_LENGTH).fill('808080'));
  assert.deepEqual(varyPalette(src, 25, () => 1), Array(LUT_LENGTH).fill('404040'));
});
