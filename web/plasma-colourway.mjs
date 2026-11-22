/* PlasmaTerm browser colourways.
 * Colourway swatches repaint UI CSS only; the renderer's LUT and worker are
 * deliberately absent from this module.
 */
export const COLOURWAY_STORAGE_KEY = 'plasmaterm.web-v0.3a.ui-colourways';
export const COLOURWAY_MAGIC = 'PLASMATERM_UI_COLOURWAY_V1';
export const COLOURWAY_SIZE = 256;
export const COLOURWAY_BANKS = 10;
export const SPARE_COLOUR = '101810';

export const normalizeColour = (value) => {
  const hex = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : null;
};

function cssHexParts(token) {
  const hex = String(token).replace(/^#/, '');
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null;
  const colour = (hex.length <= 4
    ? hex.slice(0, 3).split('').map((c) => c + c).join('')
    : hex.slice(0, 6)).toUpperCase();
  const alpha = hex.length === 4
    ? parseInt(hex[3] + hex[3], 16)
    : hex.length === 8 ? parseInt(hex.slice(6), 16) : null;
  return { colour, alpha };
}

function cssTokens(source) {
  return [...source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)];
}

export function buildColourwayCatalog(source) {
  const entries = [], byOriginal = new Map();
  const tokens = cssTokens(source);
  for (const match of tokens) {
    const parsed = cssHexParts(match[0]);
    if (!parsed) continue;
    let index = byOriginal.get(parsed.colour);
    if (index === undefined) {
      index = entries.length;
      if (index >= COLOURWAY_SIZE) throw new Error('More than 256 distinct UI CSS colours; update the colourway mapping.');
      const prefix = source.slice(0, match.index);
      const open = prefix.lastIndexOf('{');
      const close = prefix.lastIndexOf('}');
      const selector = open > close
        ? prefix.slice(Math.max(close + 1, 0), open).trim().split('\n').pop().trim()
        : 'GLOBAL';
      entries.push({ index, original: parsed.colour, selector: selector.slice(0, 100), alphas: [] });
      byOriginal.set(parsed.colour, index);
    }
    if (parsed.alpha !== null && !entries[index].alphas.includes(parsed.alpha)) {
      entries[index].alphas.push(parsed.alpha);
    }
  }
  return {
    entries,
    count: entries.length,
    defaultPalette: [...entries.map((entry) => entry.original),
      ...Array(COLOURWAY_SIZE - entries.length).fill(SPARE_COLOUR)],
    byOriginal,
  };
}

// CSS variable fallbacks preserve the exact authored skin before JS loads and
// if colourway storage is unavailable. Alpha is independent of the RGB swatch.
export function rewriteColourwayCss(source, catalog) {
  return source.replace(/#[0-9a-fA-F]{3,8}\b/g, (token) => {
    const parts = cssHexParts(token);
    const index = parts && catalog.byOriginal.get(parts.colour);
    if (index === undefined) return token;
    const name = '--plasmaterm-ui-' + String(index).padStart(3, '0') +
      (parts.alpha === null ? '' : '-a' + String(parts.alpha));
    return 'var(' + name + ', ' + token + ')';
  });
}

export function encodeColourway(catalog, palette) {
  if (!Array.isArray(palette) || palette.length !== COLOURWAY_SIZE ||
      palette.some((color) => normalizeColour(color) === null)) throw new Error('Invalid UI colourway.');
  return JSON.stringify({
    format: COLOURWAY_MAGIC,
    overrides: Object.fromEntries(catalog.entries
      .filter((entry) => palette[entry.index] !== entry.original)
      .map((entry) => [entry.original, palette[entry.index]])),
    extras: palette.slice(catalog.count),
  }, null, 2);
}

export function decodeColourway(text, catalog) {
  let data;
  try { data = JSON.parse(String(text)); } catch { return null; }
  if (!data || data.format !== COLOURWAY_MAGIC ||
      !data.overrides || typeof data.overrides !== 'object' ||
      Array.isArray(data.overrides) || !Array.isArray(data.extras)) return null;
  const palette = [...catalog.defaultPalette];
  for (const entry of catalog.entries) {
    if (Object.hasOwn(data.overrides, entry.original)) {
      const color = normalizeColour(data.overrides[entry.original]);
      if (!color) return null;
      palette[entry.index] = color;
    }
  }
  if (data.extras.length > COLOURWAY_SIZE - catalog.count) return null;
  for (let i = 0; i < data.extras.length; i += 1) {
    const color = normalizeColour(data.extras[i]);
    if (!color) return null;
    palette[catalog.count + i] = color;
  }
  return palette;
}

function safeStoredBanks(raw) {
  if (!raw || raw.version !== 1 || !raw.banks || typeof raw.banks !== 'object') return {};
  const result = {};
  for (let i = 0; i < COLOURWAY_BANKS; i += 1) {
    const candidate = raw.banks[String(i)];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const overrides = {};
    for (const [original, color] of Object.entries(candidate.overrides || {})) {
      if (/^[0-9A-F]{6}$/.test(original) && normalizeColour(color)) overrides[original] = normalizeColour(color);
    }
    const extras = Array.isArray(candidate.extras)
      ? candidate.extras.slice(0, COLOURWAY_SIZE).map(normalizeColour) : [];
    if (extras.some((color) => !color)) continue;
    result[String(i)] = { overrides, extras };
  }
  return result;
}

export function createColourwayController({ stylesheet, root = document.documentElement,
  storage = null, search = '' }) {
  if (!stylesheet) throw new Error('Missing PlasmaTerm UI stylesheet.');
  const source = stylesheet.textContent;
  const catalog = buildColourwayCatalog(source);
  stylesheet.textContent = rewriteColourwayCss(source, catalog);
  let saved = null;
  if (search !== '?skin=default' && !new URLSearchParams(search).has('skin-default')) {
    try { saved = JSON.parse(storage?.getItem(COLOURWAY_STORAGE_KEY) || 'null'); }
    catch { saved = null; }
  }
  const banks = safeStoredBanks(saved);
  let activeBank = Number.isInteger(saved?.activeBank) &&
    saved.activeBank >= 0 && saved.activeBank < COLOURWAY_BANKS ? saved.activeBank : 0;
  let lastApplied = null, revision = 0, persistenceError = false;

  const getPalette = (bank = activeBank) => {
    const result = [...catalog.defaultPalette], entry = banks[String(bank)];
    if (!entry) return result;
    for (const item of catalog.entries) {
      const value = entry.overrides[item.original];
      if (value) result[item.index] = value;
    }
    for (let i = 0; i < Math.min(entry.extras.length, COLOURWAY_SIZE - catalog.count); i += 1)
      result[catalog.count + i] = entry.extras[i];
    return result;
  };
  function store() {
    try {
      storage?.setItem(COLOURWAY_STORAGE_KEY,
        JSON.stringify({ version: 1, activeBank, banks }));
      persistenceError = false;
    } catch { persistenceError = true; }
  }
  function apply() {
    const palette = getPalette();
    for (const item of catalog.entries) {
      const index = item.index, color = palette[index];
      if (lastApplied && lastApplied[index] === color) continue;
      const name = '--plasmaterm-ui-' + String(index).padStart(3, '0');
      root.style.setProperty(name, '#' + color);
      for (const alpha of item.alphas) {
        const rgb = [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16));
        root.style.setProperty(name + '-a' + String(alpha),
          'rgba(' + rgb.join(',') + ',' + (alpha / 255).toFixed(5) + ')');
      }
    }
    // The original CSS also uses space-delimited RGB semantic variables.
    const accentIndex = catalog.byOriginal.get('B7EF30');
    if (accentIndex !== undefined) {
      const hex = palette[accentIndex];
      const rgb = [0, 2, 4].map((i) => String(parseInt(hex.slice(i, i + 2), 16))).join(' ');
      root.style.setProperty('--accent-rgb', rgb);
      root.style.setProperty('--energy-highlight-rgb', rgb);
    }
    lastApplied = palette;
    root.dataset.uiColourwayBank = String(activeBank);
    root.dataset.uiColourwayMapped = String(catalog.count);
  }
  function replacePalette(palette) {
    if (!Array.isArray(palette) || palette.length !== COLOURWAY_SIZE) return false;
    const normalized = palette.map(normalizeColour);
    if (normalized.some((color) => !color)) return false;
    const overrides = {};
    for (const item of catalog.entries) {
      if (normalized[item.index] !== item.original)
        overrides[item.original] = normalized[item.index];
    }
    banks[String(activeBank)] = { overrides, extras: normalized.slice(catalog.count) };
    revision += 1;
    store();
    apply();
    return true;
  }
  function selectBank(bank) {
    const next = Number(bank);
    if (!Number.isInteger(next) || next < 0 || next >= COLOURWAY_BANKS) return false;
    activeBank = next;
    revision += 1;
    store();
    apply();
    return true;
  }
  function resetActiveBank() {
    delete banks[String(activeBank)];
    revision += 1;
    store();
    apply();
  }
  function state() {
    return { slot: String(activeBank), revision, colors: getPalette() };
  }
  apply();
  return {
    catalog, state, getPalette, replacePalette, selectBank, resetActiveBank,
    get persistenceError() { return persistenceError; },
    exportCurrent: () => encodeColourway(catalog, getPalette()),
    parseImport: (text) => decodeColourway(text, catalog),
  };
}
