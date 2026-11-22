/* PlasmaTerm spatial LUT editor.
 * Xenofield V4.3b-compatible 16x16 tools, with a worker-backed PlasmaTerm adapter.
 * The engine's palette format remains exactly 256 uppercase RRGGBB values.
 */
export const LUT_SIDE = 16;
export const LUT_LENGTH = 256;
export const LUT_REGION_MAGIC = 'XENOFIELD_LUT_REGION_V1';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const xy = (index) => [index % LUT_SIDE, Math.floor(index / LUT_SIDE)];
const at = (x, y) => y * LUT_SIDE + x;
const indicesOf = (indices) => [...new Set(indices)].filter((i) =>
  Number.isInteger(i) && i >= 0 && i < LUT_LENGTH).sort((a, b) => a - b);

export function normalizeHex(value) {
  const hex = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : null;
}
export function validPalette(colors) {
  return Array.isArray(colors) && colors.length === LUT_LENGTH &&
    colors.every((color) => normalizeHex(color) !== null);
}
export function bounds(indices) {
  const list = indicesOf(indices);
  if (!list.length) return null;
  const xs = list.map((i) => i % LUT_SIDE);
  const ys = list.map((i) => Math.floor(i / LUT_SIDE));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
export function rectangle(a, b) {
  const [ax, ay] = xy(a), [bx, by] = xy(b), result = [];
  for (let y = Math.min(ay, by); y <= Math.max(ay, by); y += 1)
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x += 1) result.push(at(x, y));
  return result;
}
export function selectionRectangle(original, a, b, mode = 'replace') {
  const base = new Set(indicesOf(original)), area = rectangle(a, b);
  if (mode === 'replace') return new Set(area);
  for (const index of area) {
    if (mode === 'add') base.add(index);
    if (mode === 'subtract') base.delete(index);
    if (mode === 'toggle') original.has(index) ? base.delete(index) : base.add(index);
  }
  return base;
}
export function makeRegion(colors, selected) {
  if (!validPalette(colors)) throw new Error('Invalid 256-colour LUT.');
  const list = indicesOf(selected), regionBounds = bounds(list);
  if (!regionBounds) return null;
  const maskSet = new Set(list), regionColors = [], mask = [];
  for (let y = regionBounds.minY; y <= regionBounds.maxY; y += 1)
    for (let x = regionBounds.minX; x <= regionBounds.maxX; x += 1) {
      const index = at(x, y), included = maskSet.has(index);
      mask.push(included);
      regionColors.push(included ? normalizeHex(colors[index]) : null);
    }
  return { width: regionBounds.width, height: regionBounds.height, colors: regionColors, mask };
}
export function validateRegion(region) {
  const { width, height, colors, mask } = region || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > LUT_SIDE || height > LUT_SIDE ||
      !Array.isArray(colors) || colors.length !== width * height ||
      !Array.isArray(mask) || mask.length !== colors.length ||
      !mask.every((value) => typeof value === 'boolean')) return null;
  if (colors.some((color, i) => mask[i] && !normalizeHex(color))) return null;
  return { width, height, colors: colors.map((color, i) =>
    mask[i] ? normalizeHex(color) : null), mask: [...mask] };
}
export function encodeRegion(region) {
  const valid = validateRegion(region);
  if (!valid) throw new Error('Invalid LUT clipboard region.');
  return LUT_REGION_MAGIC + '\n' + JSON.stringify(valid);
}
export function decodeRegion(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith(LUT_REGION_MAGIC + '\n')) {
    try { return validateRegion(JSON.parse(raw.slice(LUT_REGION_MAGIC.length + 1))); }
    catch { return null; }
  }
  // Accept Xenofield matrices, legacy PlasmaTerm 32x8 exports, and hex lists.
  const lines = raw.replace(/[\[\]{}()"']/g, ' ').split(/\r?\n/)
    .map((line) => line.trim().split(/[\s,;]+/).filter(Boolean))
    .filter((row) => row.length);
  const tokens = lines.flat();
  if (!tokens.length || tokens.length > LUT_LENGTH || tokens.some((token) => !normalizeHex(token)))
    return null;
  let width, height;
  if (tokens.length === LUT_LENGTH) {
    width = height = LUT_SIDE;
  } else if (lines.length > 1 && lines.length <= LUT_SIDE &&
             lines.every((row) => row.length === lines[0].length) &&
             lines[0].length <= LUT_SIDE) {
    width = lines[0].length;
    height = lines.length;
  } else {
    width = Math.min(LUT_SIDE, tokens.length);
    height = Math.ceil(tokens.length / width);
  }
  if (height > LUT_SIDE) return null;
  const colors = Array(width * height).fill(null);
  const mask = Array(width * height).fill(false);
  tokens.forEach((token, index) => { colors[index] = normalizeHex(token); mask[index] = true; });
  return validateRegion({ width, height, colors, mask });
}
export function pasteRegion(colors, region, selected, active = 0) {
  if (!validPalette(colors)) throw new Error('Invalid 256-colour LUT.');
  const valid = validateRegion(region);
  if (!valid) throw new Error('Invalid clipboard region.');
  const next = colors.map(normalizeHex);
  const list = indicesOf(selected);
  if (list.length) {
    const target = bounds(list), included = new Set(list);
    for (let y = target.minY; y <= target.maxY; y += 1)
      for (let x = target.minX; x <= target.maxX; x += 1) {
        const dest = at(x, y);
        if (!included.has(dest)) continue;
        const source = ((y - target.minY) % valid.height) * valid.width +
          ((x - target.minX) % valid.width);
        if (valid.mask[source]) next[dest] = valid.colors[source];
      }
  } else {
    const [startX, startY] = xy(clamp(active, 0, LUT_LENGTH - 1));
    for (let y = 0; y < valid.height; y += 1)
      for (let x = 0; x < valid.width; x += 1) {
        const destX = startX + x, destY = startY + y, source = y * valid.width + x;
        if (destX < LUT_SIDE && destY < LUT_SIDE && valid.mask[source])
          next[at(destX, destY)] = valid.colors[source];
      }
  }
  return next;
}
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (channels) => channels.map((v) =>
  clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
export function lerpHex(a, b, t) {
  const c0 = rgb(normalizeHex(a) || '000000'), c1 = rgb(normalizeHex(b) || '000000');
  return toHex(c0.map((v, i) => v + (c1[i] - v) * clamp(t, 0, 1)));
}
export function gradientPalette(colors, selection, mode, colorA, colorB) {
  if (!validPalette(colors)) throw new Error('Invalid 256-colour LUT.');
  const ids = indicesOf(selection);
  const target = ids.length ? ids : Array.from({ length: LUT_LENGTH }, (_, i) => i);
  const area = bounds(target), next = [...colors];
  const cx = (area.minX + area.maxX) / 2, cy = (area.minY + area.maxY) / 2;
  const maxR = Math.max(0.001, Math.hypot(Math.max(cx - area.minX, area.maxX - cx),
    Math.max(cy - area.minY, area.maxY - cy)));
  for (const index of target) {
    const [x, y] = xy(index);
    const hx = (x - area.minX) / Math.max(1, area.width - 1);
    const hy = (y - area.minY) / Math.max(1, area.height - 1);
    const t = mode === 'vertical' ? hy : mode === 'diagonal' ? (hx + hy) / 2 :
      mode === 'radial' ? Math.hypot(x - cx, y - cy) / maxR : hx;
    next[index] = lerpHex(colorA, colorB, t);
  }
  return next;
}
export function transformPalette(colors, selected, kind, active = 0) {
  if (!validPalette(colors)) throw new Error('Invalid 256-colour LUT.');
  const list = indicesOf(selected.length ? selected : [active]);
  const area = bounds(list), membership = new Set(list), next = [...colors];
  for (const index of list) {
    const [x, y] = xy(index);
    let sourceX = x, sourceY = y;
    if (kind === 'flip-h' || kind === 'rotate-180') sourceX = area.minX + area.maxX - x;
    if (kind === 'flip-v' || kind === 'rotate-180') sourceY = area.minY + area.maxY - y;
    const source = at(sourceX, sourceY);
    if (membership.has(source)) next[index] = colors[source];
  }
  return next;
}
export function varyPalette(colors, percentage, random = Math.random) {
  if (!validPalette(colors)) throw new Error('Invalid 256-colour LUT.');
  const scale = clamp(Number(percentage) || 0, 0, 100) / 100;
  if (scale === 0) return [...colors];
  const anchors = Array.from({ length: 8 }, () =>
    [0, 1, 2].map(() => Math.min(255, Math.floor(random() * 256))));
  return colors.map((hex, i) => {
    const position = i * anchors.length / LUT_LENGTH, index = Math.floor(position);
    const t = (1 - Math.cos(Math.PI * (position - index))) / 2;
    const next = anchors[index].map((value, channel) =>
      value + (anchors[(index + 1) % anchors.length][channel] - value) * t);
    return toHex(rgb(hex).map((value, channel) =>
      value + (next[channel] - value) * scale));
  });
}

function brushOffsets(shape, size, seed, index) {
  const radius = clamp(Math.round(size), 1, 5) - 1, offsets = [];
  const hash = (n) => {
    n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9);
    n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
    return (n >>> 0) / 4294967295;
  };
  for (let dy = -radius; dy <= radius; dy += 1)
    for (let dx = -radius; dx <= radius; dx += 1) {
      let include = shape === 'square';
      if (shape === 'pixel') include = dx === 0 && dy === 0;
      if (shape === 'diamond') include = Math.abs(dx) + Math.abs(dy) <= radius;
      if (shape === 'round') include = dx * dx + dy * dy <= radius * radius + 0.3;
      if (shape === 'irregular') {
        const distance = Math.hypot(dx, dy);
        include = distance <= radius + 0.35 &&
          hash(seed + index * 131 + dx * 733 + dy * 1999) >
            distance / Math.max(1, radius + 1) * 0.28;
      }
      if (include) offsets.push([dx, dy]);
    }
  return offsets;
}

export function installLutEditor({ root, onCommit, onError, onSelectSlot, colourways }) {
  const $ = (id) => root.querySelector('#' + id);
  const grid = $('lut-grid'), strip = $('lut-strip'), status = $('lut-selection-status');
  const cells = [], inputs = [], historyBySlot = new Map();
  let state = { colors: Array(LUT_LENGTH).fill('000000'), slot: 'none', revision: 0 };
  let ready = false, hasState = false, selected = new Set(), active = 0;
  let tool = 'select', drag = null, stroke = null, clipboard = null, pending = [];
  let strokeSeed = 0, note = '';
  const colors = { a: 'ED57AE', b: '32A68F' };
  let mode = 'plasma', workerReady = false, rendererHasState = false;
  let rendererState = { ...state, colors: [...state.colors] };
  let requestedSlot = null;
  const samePalette = (left, right) =>
    left.every((value, index) => value === right[index]);
  const stackKey = (target = mode, slot = state.slot) => target + ':' + slot;

  function decorateGrid() {
    const entries = colourways?.catalog.entries || [];
    const filter = $('lut-colourway-search').value.trim().toLowerCase().replace(/^#/, '');
    let matches = 0;
    for (let i = 0; i < inputs.length; i += 1) {
      const item = mode === 'ui' ? entries[i] : null;
      const matchesFilter = Boolean(item) && (!filter ||
        item.original.toLowerCase().includes(filter) ||
        item.selector.toLowerCase().includes(filter) ||
        String(i).includes(filter));
      if (matchesFilter) matches += 1;
      cells[i].classList.toggle('is-ui-filtered', mode === 'ui' &&
        Boolean(filter) && !matchesFilter);
      const description = item
        ? 'UI colour ' + i + ' · #' + item.original + ' · ' + item.selector
        : mode === 'ui' ? 'Reserved colourway swatch ' + i
          : 'Plasma LUT colour ' + i;
      inputs[i].setAttribute('aria-label', description + ', double click to edit');
      cells[i].title = description;
      cells[i].classList.toggle('is-ui-reserved', mode === 'ui' && !item);
    }
    $('lut-reset-skin').hidden = mode !== 'ui';
    $('lut-colourway-search-label').hidden = mode !== 'ui';
    $('lut-colourway-info').hidden = mode !== 'ui';
    $('lut-colourway-info').textContent = entries.length +
      ' BOUND COLOURS · ' + (LUT_LENGTH - entries.length) +
      ' RESERVED' + (filter ? ' · ' + matches + ' MATCHING' : '');
  }
  $('lut-colourway-search').addEventListener('input', decorateGrid);
  function activateTarget(next) {
    if (next !== 'plasma' && next !== 'ui') return;
    if (mode === next) return;
    if (mode === 'plasma') rendererState = state;
    mode = next;
    state = mode === 'ui' ? colourways.state() : rendererState;
    hasState = mode === 'ui' || rendererHasState;
    selected = new Set(); active = 0;
    root.dataset.lutMode = mode;
    $('lut-target').value = mode;
    $('lut-bank').querySelector('option[value="none"]').hidden = mode === 'ui';
    decorateGrid();
    setReady(workerReady);
    paintAll();
    report(mode === 'ui' ? 'EDITING INTERFACE SKIN' : 'EDITING PLASMA LUT');
  }
  $('lut-target').addEventListener('change', (event) => activateTarget(event.target.value));
  $('lut-bank').addEventListener('change', (event) => {
    const slot = event.target.value;
    if (!ready || !hasState || slot === state.slot) return;
    if (mode === 'ui') {
      if (!colourways.selectBank(slot)) {
        $('lut-bank').value = state.slot;
        return report('COLOURWAY BANK IS UNAVAILABLE', true);
      }
      state = colourways.state();
      selected.clear(); active = 0;
      paintAll();
      return report('COLOURWAY ' + slot);
    }
    if (!/^[0-9]$/.test(slot) || !onSelectSlot?.(slot)) {
      $('lut-bank').value = state.slot;
      report('LUT BANK SWITCH IS UNAVAILABLE', true);
    } else {
      requestedSlot = slot;
      setReady(workerReady);
      report('SWITCHING PLASMA BANK');
    }
  });
  const writeButtons = [...root.querySelectorAll('[data-lut-write]')];
  const toolButtons = { select: $('lut-select'), brush: $('lut-brush'), pick: $('lut-pick') };

  function stacks() {
    const key = stackKey();
    if (!historyBySlot.has(key)) historyBySlot.set(key, { undo: [], redo: [] });
    return historyBySlot.get(key);
  }
  function report(message, error = false) {
    note = String(message || '');
    status.dataset.error = String(error);
    updateStatus();
    if (error) onError?.(message);
  }
  function updateStatus() {
    const ids = indicesOf(selected), box = bounds(ids);
    status.textContent = (ids.length ?
      ids.length + ' CELLS · ' + box.width + '×' + box.height +
      ' · X' + box.minX + '–' + box.maxX + ' Y' + box.minY + '–' + box.maxY :
      'NO SELECTION · ACTIVE ' + active) + (note ? ' · ' + note : '');
    $('lut-undo').disabled = !stacks().undo.length || !ready;
    $('lut-redo').disabled = !stacks().redo.length || !ready;
    $('lut-active-slot').textContent = mode === 'ui'
      ? 'UI BANK ' + String(state.slot).padStart(2, '0')
      : state.slot === 'none' ? 'PROCEDURAL → SLOT 0' : 'SLOT ' + state.slot;
    if (mode === 'ui' && selected.size === 1) {
      const info = colourways.catalog.entries[active];
      if (info) status.textContent += ' · SOURCE #' + info.original +
        ' · ' + info.selector;
      else status.textContent += ' · RESERVED SWATCH';
    }
  }
  function foreground(hex) {
    const channels = rgb(hex).map((v) => {
      const t = v / 255;
      return t <= 0.04045 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 +
      channels[2] * 0.0722 > 0.46 ? '#10120a' : '#f2ffe3';
  }
  function paintCell(index, color = state.colors[index]) {
    const cell = cells[index], field = inputs[index], value = normalizeHex(color) || '000000';
    if (!(document.activeElement === field && !field.readOnly)) field.value = value;
    field.style.backgroundColor = '#' + value;
    field.style.color = foreground(value);
    cell.classList.toggle('is-selected', selected.has(index));
    cell.classList.toggle('is-active', active === index);
  }
  function paintSelection() {
    for (let i = 0; i < LUT_LENGTH; i += 1) {
      cells[i].classList.toggle('is-selected', selected.has(i));
      cells[i].classList.toggle('is-active', active === i);
    }
    updateStatus();
  }
  function paintStrip(palette = state.colors) {
    const ctx = strip.getContext('2d');
    if (!ctx) return;
    for (let i = 0; i < LUT_LENGTH; i += 1) {
      ctx.fillStyle = '#' + palette[i];
      ctx.fillRect(i * strip.width / LUT_LENGTH, 0,
        Math.ceil(strip.width / LUT_LENGTH), strip.height);
    }
  }
  function paintAll() {
    for (let i = 0; i < LUT_LENGTH; i += 1) paintCell(i);
    paintStrip();
    updateStatus();
  }
  function setReady(value) {
    workerReady = Boolean(value);
    ready = mode === 'ui' || workerReady;
    const enabled = ready && hasState && (mode === 'ui' || requestedSlot === null);
    for (const button of writeButtons) button.disabled = !enabled;
    $('lut-bank').disabled = !enabled;
    grid.setAttribute('aria-disabled', String(!enabled));
    updateStatus();
  }
  function sync(incoming) {
    if (!validPalette(incoming?.colors)) return;
    const next = { colors: incoming.colors.map(normalizeHex),
      slot: String(incoming.slot ?? 'none'), revision: Number(incoming.revision) || 0 };
    // The worker can acknowledge a queued write while the UI colourway editor
    // is open. Reconcile only the cached plasma state; never repaint the UI LUT.
    const ackIndex = pending.findIndex((entry) =>
      (entry.slot === next.slot || (entry.slot === 'none' && next.slot === '0')) &&
      samePalette(entry.colors, next.colors));
    if (ackIndex >= 0) {
      pending.splice(0, ackIndex + 1);
      if (rendererState.slot === 'none' && next.slot === '0') {
        const history = historyBySlot.get('plasma:none');
        if (history) historyBySlot.set('plasma:0', history);
        historyBySlot.delete('plasma:none');
      }
      if (pending.length) {
        rendererState = { ...rendererState, slot: next.slot, revision: next.revision };
        if (mode === 'plasma') {
          state = rendererState;
          root.dataset.lutSlot = state.slot;
          root.dataset.lutRevision = String(state.revision);
          $('lut-bank').value = state.slot;
          updateStatus();
        }
        return;
      }
    } else {
      // External LUT/preset change cannot reuse prior undo state.
      pending = [];
      if (rendererHasState && next.slot === rendererState.slot &&
          !samePalette(next.colors, rendererState.colors))
        historyBySlot.delete(stackKey('plasma', next.slot));
    }
    rendererState = next;
    rendererHasState = true;
    if (requestedSlot !== null && requestedSlot === next.slot)
      requestedSlot = null;
    if (mode !== 'plasma') return;
    state = rendererState;
    hasState = true;
    root.dataset.lutSlot = state.slot;
    root.dataset.lutRevision = String(state.revision);
    $('lut-bank').value = state.slot;
    setReady(workerReady);
    paintAll();
  }
  function commit(next, label) {
    const palette = next.map(normalizeHex);
    if (!ready || !hasState || (mode === 'plasma' && requestedSlot !== null))
      return report('TARGET IS NOT READY FOR EDITING', true), false;
    if (!validPalette(palette)) return report('INVALID 256-COLOUR LUT', true), false;
    if (samePalette(palette, state.colors)) return false;
    const before = [...state.colors];
    const accepted = mode === 'ui'
      ? colourways.replacePalette(palette)
      : onCommit(palette);
    if (!accepted) return report('PALETTE WRITE REJECTED', true), false;
    const stack = stacks();
    stack.undo.push({ before, after: [...palette], label });
    if (stack.undo.length > 64) stack.undo.shift();
    stack.redo = [];
    if (mode === 'plasma') pending.push({ slot: state.slot, colors: [...palette] });
    state.colors = palette;
    if (mode === 'ui') state.revision = colourways.state().revision;
    else rendererState = state;
    paintAll();
    report(label);
    return true;
  }
  function restore(direction) {
    const stack = stacks(), from = direction === 'undo' ? stack.undo : stack.redo;
    const to = direction === 'undo' ? stack.redo : stack.undo;
    const record = from.pop();
    if (!record) return;
    const palette = direction === 'undo' ? record.before : record.after;
    if (mode === 'plasma' && requestedSlot !== null) {
      from.push(record);
      return report('WAIT FOR PLASMA BANK SWITCH', true);
    }
    const accepted = mode === 'ui' ? colourways.replacePalette(palette) : onCommit(palette);
    if (!accepted) { from.push(record); return report('PALETTE WRITE REJECTED', true); }
    to.push(record);
    if (mode === 'plasma') pending.push({ slot: state.slot, colors: [...palette] });
    state.colors = [...palette];
    if (mode === 'ui') state.revision = colourways.state().revision;
    else rendererState = state;
    paintAll();
    report(direction.toUpperCase() + ' ' + record.label);
  }
  function setTool(next) {
    tool = next;
    grid.dataset.tool = next;
    Object.entries(toolButtons).forEach(([name, button]) => {
      button.classList.toggle('is-pressed', name === tool);
      button.setAttribute('aria-pressed', String(name === tool));
    });
    report(next.toUpperCase());
  }
  function updateColors() {
    for (const key of ['a', 'b']) {
      $('lut-color-' + key).value = '#' + colors[key];
      if (document.activeElement !== $('lut-hex-' + key))
        $('lut-hex-' + key).value = colors[key];
      $('lut-swatch-' + key).style.backgroundColor = '#' + colors[key];
    }
  }
  for (const key of ['a', 'b']) {
    $('lut-color-' + key).addEventListener('input', (event) => {
      colors[key] = normalizeHex(event.target.value);
      updateColors();
    });
    $('lut-hex-' + key).addEventListener('change', (event) => {
      const value = normalizeHex(event.target.value);
      if (!value) return report('COLOUR REQUIRES 6 HEX DIGITS', true), updateColors();
      colors[key] = value;
      updateColors();
    });
  }
  $('lut-swap').addEventListener('click', () => {
    [colors.a, colors.b] = [colors.b, colors.a];
    updateColors();
  });

  for (let i = 0; i < LUT_LENGTH; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'lut-cell';
    cell.dataset.index = String(i);
    const field = document.createElement('input');
    field.className = 'lut-field';
    field.type = 'text';
    field.maxLength = 7;
    field.readOnly = true;
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.setAttribute('aria-label', 'LUT colour ' + i + ', double click to edit');
    field.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      active = i;
      selected = new Set([i]);
      field.readOnly = false;
      field.focus();
      field.select();
      paintSelection();
    });
    let cancelled = false;
    field.addEventListener('keydown', (event) => {
      if (field.readOnly) return;
      if (event.key === 'Escape') {
        cancelled = true; field.value = state.colors[i]; field.blur();
        event.stopPropagation();
      } else if (event.key === 'Enter') {
        field.blur(); event.preventDefault();
      }
    });
    field.addEventListener('blur', () => {
      if (field.readOnly) return;
      field.readOnly = true;
      const value = normalizeHex(field.value);
      if (!cancelled && value) {
        const next = [...state.colors];
        next[i] = value;
        active = i;
        selected = new Set([i]);
        commit(next, 'CELL EDIT');
      } else if (!cancelled) report('COLOUR REQUIRES 6 HEX DIGITS', true);
      cancelled = false;
      paintCell(i);
    });
    cell.append(field); grid.append(cell);
    cells.push(cell); inputs.push(field);
  }

  const cellAt = (event) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element?.closest?.('.lut-cell');
    return cell && grid.contains(cell) ? Number(cell.dataset.index) : null;
  };
  function selectBox(a, b, mode, base) {
    selected = selectionRectangle(base, a, b, mode);
    active = b;
    paintSelection();
  }
  function applyStroke(index) {
    if (!stroke) return;
    const [cx, cy] = xy(index);
    const size = Number($('lut-brush-size').value);
    const shape = $('lut-brush-shape').value;
    for (const [dx, dy] of brushOffsets(shape, size, stroke.seed, index)) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= LUT_SIDE || y < 0 || y >= LUT_SIDE) continue;
      const target = at(x, y);
      stroke.draft[target] = stroke.color;
      stroke.indices.add(target);
      paintCell(target, stroke.color);
    }
    active = index;
    paintStrip(stroke.draft);
  }
  function finishPointer() {
    if (stroke) {
      const finished = stroke;
      stroke = null;
      if (finished.indices.size) {
        selected = new Set(finished.indices);
        commit(finished.draft, 'BRUSH STROKE');
        paintSelection();
      } else paintAll();
    }
    drag = null;
  }
  grid.addEventListener('contextmenu', (event) => event.preventDefault());
  grid.addEventListener('pointerdown', (event) => {
    if (![0, 2].includes(event.button) || !ready || !hasState ||
        (mode === 'plasma' && requestedSlot !== null)) return;
    if (event.target.matches('input:not([readonly])')) return;
    const cell = event.target.closest('.lut-cell');
    if (!cell) return;
    const index = Number(cell.dataset.index);
    event.preventDefault();
    grid.focus({ preventScroll: true });
    if (tool === 'pick') {
      colors[event.button === 2 ? 'b' : 'a'] = state.colors[index];
      selected = new Set([index]); active = index;
      updateColors(); paintSelection();
      return report('PICK ' + (event.button === 2 ? 'B' : 'A'));
    }
    if (tool === 'brush') {
      stroke = { draft: [...state.colors], indices: new Set(),
        color: colors[event.button === 2 ? 'b' : 'a'], seed: ++strokeSeed,
        last: index };
      applyStroke(index);
    } else {
      const mode = event.altKey ? 'subtract' :
        (event.ctrlKey || event.metaKey) ? 'toggle' : event.shiftKey ? 'add' : 'replace';
      drag = { anchor: index, last: index, mode, base: new Set(selected) };
      selectBox(index, index, mode, drag.base);
    }
    grid.setPointerCapture?.(event.pointerId);
  });
  grid.addEventListener('pointermove', (event) => {
    if (!drag && !stroke) return;
    const index = cellAt(event);
    if (index === null) return;
    if (stroke) {
      // Events are not delivered once per grid cell during fast movement:
      // interpolate through the skipped cells so a stroke stays connected.
      const [ax, ay] = xy(stroke.last), [bx, by] = xy(index);
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let step = 1; step <= steps; step += 1) {
        const x = Math.round(ax + (bx - ax) * step / steps);
        const y = Math.round(ay + (by - ay) * step / steps);
        applyStroke(at(x, y));
      }
      stroke.last = index;
    } else if (index !== drag.last) {
      drag.last = index;
      selectBox(drag.anchor, index, drag.mode, drag.base);
    }
  });
  grid.addEventListener('pointerup', finishPointer);
  grid.addEventListener('pointercancel', finishPointer);
  grid.addEventListener('lostpointercapture', finishPointer);
  function all() {
    selected = new Set(Array.from({ length: LUT_LENGTH }, (_, i) => i)); paintSelection();
  }
  function none() { selected.clear(); paintSelection(); }
  $('lut-all').onclick = all;
  $('lut-none').onclick = none;
  $('lut-invert').onclick = () => {
    selected = new Set(Array.from({ length: LUT_LENGTH }, (_, i) => i)
      .filter((i) => !selected.has(i)));
    paintSelection();
  };
  $('lut-row').onclick = () => {
    const [, y] = xy(active);
    selected = new Set(Array.from({ length: LUT_SIDE }, (_, x) => at(x, y)));
    paintSelection();
  };
  $('lut-column').onclick = () => {
    const [x] = xy(active);
    selected = new Set(Array.from({ length: LUT_SIDE }, (_, y) => at(x, y)));
    paintSelection();
  };
  for (const [name, button] of Object.entries(toolButtons))
    button.onclick = () => setTool(name);
  $('lut-undo').onclick = () => restore('undo');
  $('lut-redo').onclick = () => restore('redo');
  $('lut-fill').onclick = () => {
    const next = [...state.colors], ids = selected.size ? indicesOf(selected) : [active];
    for (const index of ids) next[index] = colors.a;
    commit(next, 'FILL A');
  };
  $('lut-gradient').onclick = () =>
    commit(gradientPalette(state.colors, selected, $('lut-gradient-mode').value,
      colors.a, colors.b), 'GRADIENT ' + $('lut-gradient-mode').value.toUpperCase());
  $('lut-flip-h').onclick = () =>
    commit(transformPalette(state.colors, indicesOf(selected), 'flip-h', active), 'FLIP H');
  $('lut-flip-v').onclick = () =>
    commit(transformPalette(state.colors, indicesOf(selected), 'flip-v', active), 'FLIP V');
  $('lut-rotate').onclick = () =>
    commit(transformPalette(state.colors, indicesOf(selected), 'rotate-180', active), 'ROT 180');
  $('lut-clear').onclick = () => {
    const next = [...state.colors];
    for (const i of (selected.size ? indicesOf(selected) : [active])) next[i] = '000000';
    commit(next, 'CLEAR');
  };

  function currentRegion() {
    return makeRegion(state.colors, selected.size ? selected : new Set([active]));
  }
  async function copy(cut = false) {
    const originMode = mode, originSlot = state.slot;
    const ids = selected.size ? indicesOf(selected) : [active];
    const region = makeRegion(state.colors, new Set(ids));
    clipboard = region;
    // Cut immediately against the captured target. An asynchronous clipboard
    // permission prompt must never clear a later selection or different bank.
    if (cut) {
      const next = [...state.colors];
      for (const index of ids) next[index] = '000000';
      commit(next, 'CUT REGION');
    }
    try { await navigator.clipboard?.writeText(encodeRegion(region)); } catch { /* local fallback */ }
    if (mode === originMode && state.slot === originSlot)
      report(cut ? 'CUT REGION' : 'COPIED REGION');
  }
  async function paste() {
    const originMode = mode, originSlot = state.slot;
    const originSelection = new Set(selected), originActive = active;
    let region = null;
    try { region = decodeRegion(await navigator.clipboard?.readText()); } catch { /* local fallback */ }
    region ||= clipboard;
    if (!region) return report('NOTHING TO PASTE', true);
    if (mode !== originMode || state.slot !== originSlot)
      return report('PASTE TARGET CHANGED; RETRY', true);
    commit(pasteRegion(state.colors, region, originSelection, originActive), 'PASTE REGION');
  }
  $('lut-copy').onclick = () => copy();
  $('lut-cut').onclick = () => copy(true);
  $('lut-paste').onclick = () => paste();
  root.addEventListener('paste', (event) => {
    if (event.target.matches('input:not([readonly]),select,textarea')) return;
    const region = decodeRegion(event.clipboardData?.getData('text/plain'));
    if (!region) return;
    event.preventDefault();
    clipboard = region;
    commit(pasteRegion(state.colors, region, selected, active), 'PASTE REGION');
  });
  root.addEventListener('copy', (event) => {
    if (event.target.matches('input:not([readonly]),select,textarea')) return;
    clipboard = currentRegion();
    event.clipboardData?.setData('text/plain', encodeRegion(clipboard));
    event.preventDefault();
    report('COPIED REGION');
  });
  root.addEventListener('cut', (event) => {
    if (event.target.matches('input:not([readonly]),select,textarea')) return;
    clipboard = currentRegion();
    event.clipboardData?.setData('text/plain', encodeRegion(clipboard));
    event.preventDefault();
    $('lut-clear').click();
  });
  const scaleNumber = $('lut-random-scale'), scaleRange = $('lut-random-scale-slider');
  function setScale(value) {
    const number = Number(value);
    const scale = Number.isFinite(number) ? Math.round(clamp(number, 0, 100)) : 25;
    scaleNumber.value = String(scale); scaleRange.value = String(scale);
    root.dataset.randomScale = String(scale);
  }
  scaleNumber.onchange = () => setScale(scaleNumber.value);
  scaleRange.oninput = () => setScale(scaleRange.value);
  $('randomise-lut').onclick = () => {
    if (commit(varyPalette(state.colors, Number(scaleNumber.value)), 'RANDOMISE')) {
      root.dataset.randomiseCount = String(Number(root.dataset.randomiseCount || 0) + 1);
    }
  };
  setScale(25);

  function exportText() {
    if (mode === 'ui') return colourways.exportCurrent();
    const lines = [];
    for (let i = 0; i < LUT_LENGTH; i += 8)
      lines.push(state.colors.slice(i, i + 8).join(', '));
    return lines.join('\n');
  }
  $('export-lut').onclick = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      report(mode === 'ui' ? 'UI COLOURWAY EXPORTED AS JSON' : '256 COLOURS EXPORTED TO CLIPBOARD');
    } catch (error) { report('CLIPBOARD: ' + error.message, true); }
  };
  $('lut-save').onclick = () => {
    const isUi = mode === 'ui';
    const blob = new Blob([exportText()], { type: isUi ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isUi ? 'PlasmaTerm-UI-Colourway-' + state.slot + '.json'
      : 'PlasmaTerm-LUT-' + state.slot + '.txt';
    link.click(); URL.revokeObjectURL(url);
  };
  $('lut-import').onclick = () => $('lut-file').click();
  $('lut-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const originMode = mode, originSlot = state.slot;
    try {
      const text = await file.text();
      if (mode !== originMode || state.slot !== originSlot)
        throw new Error('Import target changed while reading file.');
      const palette = mode === 'ui' ? colourways.parseImport(text) : null;
      if (palette) commit(palette, 'IMPORT UI COLOURWAY');
      else {
        const region = decodeRegion(text);
        if (!region || region.width !== LUT_SIDE || region.height !== LUT_SIDE ||
            region.mask.some((value) => !value))
          throw new Error('Import requires a complete 256-colour LUT or a UI colourway JSON.');
        commit(region.colors, 'IMPORT LUT');
      }
    } catch (error) { report(error.message, true); }
    event.target.value = '';
  };
  $('lut-reset-skin').onclick = () => {
    if (mode === 'ui') commit(colourways.catalog.defaultPalette, 'RESTORE DEFAULT UI SKIN');
  };
  strip.addEventListener('pointerdown', (event) => {
    const rect = strip.getBoundingClientRect();
    active = clamp(Math.floor((event.clientX - rect.left) /
      Math.max(1, rect.width) * LUT_LENGTH), 0, LUT_LENGTH - 1);
    selected = new Set([active]);
    paintSelection();
  });
  root.addEventListener('keydown', (event) => {
    if (event.target.matches('input:not([readonly]),select,textarea')) return;
    const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (mod && key === 'a') { event.preventDefault(); all(); }
    else if (mod && key === 'z') {
      event.preventDefault(); restore(event.shiftKey ? 'redo' : 'undo');
    } else if (mod && key === 'y') { event.preventDefault(); restore('redo'); }
    else if (mod && key === 'c') { event.preventDefault(); copy(false); }
    else if (mod && key === 'x') { event.preventDefault(); copy(true); }
    else if (mod && key === 'v') { /* use native paste; toolbar has local fallback */ }
    else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); $('lut-clear').click();
    } else if (event.key === 'Escape') {
      event.preventDefault(); none(); report('SELECTION CLEARED');
    } else if (!mod && !event.altKey && ['b', 's', 'i'].includes(key)) {
      event.preventDefault(); setTool({ b: 'brush', s: 'select', i: 'pick' }[key]);
    } else if (event.key.startsWith('Arrow') &&
               (event.target === grid || event.target.closest('.lut-cell'))) {
      const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (dx || dy) {
        event.preventDefault();
        const [x, y] = xy(active);
        active = at(clamp(x + dx, 0, 15), clamp(y + dy, 0, 15));
        selected = new Set([active]); paintSelection();
      }
    }
  });
  updateColors();
  setTool('select');
  root.dataset.lutMode = mode;
  decorateGrid();
  setReady(false);
  paintAll();
  return {
    sync, setReady, activateTarget, getSelection: () => indicesOf(selected),
    refreshColourway: () => {
      if (mode !== 'ui') return;
      state = colourways.state();
      historyBySlot.delete(stackKey('ui', state.slot));
      paintAll();
    },
  };
}
