# PlasmaTerm web-v0.3a

This directory is the bounded browser presentation of the frozen PlasmaTerm
`v0.1a` release. The page version is `web-v0.3a`; native configuration files
remain compatible. It runs the repository's Python renderer and
configuration generator in Pyodide, presents their ANSI output through
xterm.js, and intentionally does not include PlasmaTerm's later TCP control
architecture.

## Run locally

From the repository root, start any static HTTP server, then open
`http://localhost:8000/web/`:

```powershell
python -m http.server 8000
```

Publish the repository root unchanged to GitHub Pages or any static HTTP(S)
host, then link to `/web/`; the worker intentionally fetches the two shared
Python files from the repository root. Opening `index.html` via `file://` is
not supported.

## Controls

The page is a no-scroll workspace containing four independent faux-terminal
windows. A fresh desktop load begins at Pt 24 and exactly 36×24 characters;
Keybed and Modulation begin visible, while LUT starts
minimised. Windows may overlap, are brought forward when
used, and may be dragged by only the blank part of their compact title bars.
Their positions and stacking order last for the session rather than being
written to storage.

The roughly 24px title bars use compact Winamp Modern-inspired graphite
chrome, lime LCD text, ruled drag regions, bevelled controls and labelled
**PLASMATERM**, **KEYBED**, **MODULATION** and **LUT EDITOR** windows. The small
square light-shaped controls are functional. Keybed, Modulation and LUT have
minimise controls; minimising adds a labelled restore button to PlasmaTerm's
title bar. Restoring returns the window to its last position, clamps it to
the viewport and brings it to the front.

PlasmaTerm's green control toggles between desktop geometry and a
viewport-filling display while scaling Pt to retain the same character grid.
When there is extra width, fullscreen expands cell spacing rather than
silently adding columns. On narrow/mobile displays, where PlasmaTerm already
fills the viewport, green switches between the front and back of the stack.
PlasmaTerm's red control or Escape outside the LUT editor restores Pt 24, 36×24
characters and the default window positions/stacking (Keybed and Modulation
visible, LUT docked). Escape *inside* the LUT editor instead cancels a cell
edit or clears the current selection. Reset only affects presentation, not
plasma parameters or the 256-colour palettes.

Hover PlasmaTerm to reveal its four centre-anchored resize handles. Their hit
areas sit fully outside the window border so they never cover the title-bar
controls. A resize pauses frame production, changes only the shell during the
drag, and performs one xterm fit and worker resize on release. The title bar
exposes three editable display controls:

- **Pt** changes xterm font size and therefore the rendered character
  resolution. Its presets are 12, 16, 24, 36, 46, and 64; direct entry accepts
  6–200, and the two jog buttons to its left step by one. The default is 24.
- **Bg** accepts a LUT-style `RRGGBB` value (an optional leading `#` is also
  accepted). Enter or focus loss applies it to the page and terminal
  background, Modulation highlights, and docked-window tabs with automatic
  contrasting text. This appearance setting resets on reload.
- **FPS** presets are 30, 60, 120, 144, and 240; direct entry accepts
  1–1000. The default is 60, and the chosen value persists through presets,
  Randomize, and Randomize Undo.

The Keybed pairs `Q/A`, `W/S`, `T/G`, `Y/H`, `U/J`, `I/K`, and
Randomize/Undo in a compact two-row layout. Pointer press, hold, release,
cancellation, and physical keyboard input share one worker path and light the
same keycaps. `I/K` cycle stored LUTs with 0↔9 wrapping; `T/G` use a 0.03 base
speed step; and Randomize has a two-entry, session-only Undo stack.

The latching **+** and **++** controls replace Shift/Ctrl parameter scaling in
the web keybed. For speed and radius they apply 3× and 6×; for Y/X frequency
and hue shift they apply 1.5× and 3×. Both can be active, combining to 18× or
4.5× respectively. Keybed Reset releases held keys, clears both latches, and
returns those five parameters to the most recent startup, preset, Randomize,
or Randomize-Undo anchor while preserving LUT and FPS. It does not move the
window. Native PlasmaTerm retains its existing Shift 10× and Ctrl 100×
modifier behavior.

The compact **Modulation** window places its five parameter toggles vertically
at the far left. Width, AMP, and Hz align across the primary row, with the
dual-ended Width track shortened to that same slider height. The glowing
On/Off text fills the space beneath Width. Offset sits directly beneath AMP/Hz
with its label above it, and the centred, arrowless waveform dropdown fills the
bottom right. AMP and Hz labels sit centred above their compact editable
values; Hz's slider spans
−3…+3 while its field accepts −6…+6. The waveform menu provides sine,
smoothed triangle, seamless loop noise, and deterministic wander noise.

Energy remains transient and never rewrites the base configuration. Frequency
Y/X use a 0.0015 step, hue shift uses a 0.0025 step, radius uses a 0.0025 step,
and speed is unchanged. The Modulation Reset button leaves the window in place
and restores Off, AMP 25, Hz 0.5, Width −100…+100%, Offset 0, Sine, and Speed
as the sole target.

Browser keyboard controls also include `0–9` for presets, `Ctrl+0–9` for direct
LUT loads, `Alt+S` to save, and bare `P` to regenerate the complete config bank
once per press. Physical `E/D` and `R/F` retain procedural hue-range
adjustments but are intentionally absent from the mouse keybed. `O/L` do not
change FPS.

## LUT editor — Xenofield V4.3b spatial tools

Restore **LUT** from PlasmaTerm's title bar. The web editor now uses a
square **16×16** palette map with 256 cells, a full-palette preview strip,
a compact titlebar tool row and a second selection/clipboard row. The
vertically scrollable right-hand rack groups colour controls, painting,
transforms, palette generation and palette I/O. On narrow screens the same
16×16 editing topology is retained rather than reflowing into 8×32; the
operations rack moves below the map. The overall page stays no-scroll,
while the local rack may scroll.

This editor is based on Xenofield's V4.3b spatial LUT interaction model,
not a replacement for the renderer's palette representation. All worker
writes remain **exactly 256 uppercase RRGGBB values**. The existing
setLut worker path handles materialisation, rendering, active slot and
local configuration persistence. Editing while on a procedural palette
still materialises the result in stored LUT slot 0. The existing ten
palette banks, preset shortcuts and palette cycling remain unchanged.

### Selection and painting

- **SELECT:** click or drag to make a rectangular selection. Shift-drag
  adds; Ctrl/Cmd-drag toggles; Alt-drag subtracts. Toolbar commands
  select all, clear selection, invert, select row or select column.
- **BRUSH:** left paints colour A, right paints B. Choose pixel, round,
  square, diamond or irregular brush, size 1–5; a complete stroke is one
  undoable edit. **PICK:** left samples colour A, right samples B.
- **COLOUR DECK:** dual HTML colour pickers and six-digit hex fields,
  live swatches, and swap A/B. Double-click any palette cell for direct
  hexadecimal editing; Enter applies and Esc cancels.
- **TRANSFORMS:** fill selected cells with A, generate horizontal,
  vertical, diagonal or radial A→B gradients, flip horizontally or
  vertically, rotate 180°, or clear selected cells. If there is no
  selection, a fill/clear targets the active cell; gradients use all 256.
- **UNDO/REDO:** 64 history records per active LUT bank, covering direct
  cell edits, full and region pastes, cut, painting, transforms, gradients
  and randomisation. These do not alter the independent two-step
  *plasma-preset Randomize Undo* in the Keybed.

### Clipboard, import and export

**COPY/CUT/PASTE** transfers a rectangular LUT region including a
shape-preserving selection mask. Copying the selection retains holes,
so pasting sparse regions does not write to excluded cells. Pasting onto
a selected destination tiles a smaller region and respects its mask;
pasting with no selection places the region at the active cell, clipped
to the 16×16 edges. The textual clipboard header is
**XENOFIELD_LUT_REGION_V1**, allowing LUT regions to be transferred with
Xenofield's V4.3b editor. Native plain-text hexadecimal matrices are
also accepted.

**EXPORT** copies the full palette as 32 text lines with eight
comma-separated uppercase RRGGBB entries per line, compatible with the
previous PlasmaTerm editor. **SAVE TXT** downloads that text.
**IMPORT** accepts a complete 256-colour plain-text file; an invalid
count or hex value leaves the palette unchanged. Regions can also be
pasted directly from ordinary text.

The palette generator retains the existing 0–100% **VARIATION** slider:
0 leaves all colours unchanged, 25 blends a restrained variation, and
100 fully replaces the LUT with a new, cyclic eight-anchor palette.
Randomisation now shares the spatial editor's bounded undo stack.

LUT keyboard shortcuts operate only when focus is in the editor:
**S** Select, **B** Brush, **I** Pick, **Ctrl+A** select all,
**Ctrl+C/X/V** copy/cut/paste, **Ctrl+Z** undo, **Ctrl+Shift+Z** or
**Ctrl+Y** redo, **Delete** clear, and arrow keys to move the active cell.
The editor's focus is isolated from the plasma Keybed shortcuts.

### Developer checks

From the root of the web-v0.1a line (or this feature branch):

```powershell
node --test test_plasma_lut_editor.mjs
python -m unittest -v test_plasma_web.py
```

The Node tests exercise the pure spatial geometry, sparse region clipboard,
Xenofield wire format, legacy full LUT text, gradients, transforms and seeded
palette variation. The Python suite covers the existing web-to-worker
protocol and structural browser contracts. Hardware browser rendering
and Firefox/Chromium pointer interaction still require interactive checks.

The entire workspace stays at `100vw × 100dvh` with no document scrolling.
On narrow displays PlasmaTerm fills the viewport behind the floating windows;
portrait defaults stack them, while short landscape defaults place them side
by side. Overlap is allowed when space is limited. Pinch over the terminal to
change Pt and rendered resolution.

Browser focus/visibility loss clears held state. The small generated config is
saved to `localStorage`, so presets, randomization, and parameter changes
normally survive a page reload on the same browser profile.

## Runtime and limitations

Tested dependency pins:

- Pyodide `0.28.2`
- xterm.js `6.0.0`
- xterm FitAddon `0.11.0`

Pyodide runs in a Web Worker. Complete ANSI frames are coalesced on the host so
at most one unpresented frame is retained. The default browser path wraps each
xterm write in DEC 2026 synchronized-output delimiters so a 60 FPS update does
not expose partially applied rows or flickering cell edges. Add `?sync=0` to
disable those delimiters for comparison. The default DOM renderer is used;
WebGL is intentionally not enabled for this unusually high-churn workload.

Performance depends on viewport and character size. The bounded desktop
default prevents rendering from automatically expanding to the entire browser
window; larger characters reduce the number of rendered cells. No backend, account, network
control, WebSocket, or external controller is included.

## Browser validation

On 2026-08-31 the Chromium-based Codex in-app browser passed startup, true-
colour rendering, all control families, Randomize, local persistence, focus
reset, centre-anchored zigzag resize recovery, draggable positioning, two-level
Undo, LUT cycling, signed/noise Energy modulation, and no-scroll responsive layouts.
The original performance pass tested cells from 61×21 through 141×43. Python sustained
about 39.8 produced FPS. At 140×43, the bounded host presented roughly 14–16
FPS, coalesced obsolete worker frames, and accumulated no main-thread frame
queue. DEC 2026 and browser-side atomic writes performed similarly in that
original pass. Three random slots produced byte-for-byte identical
configuration SHA-256 hashes in native Python and Pyodide.

A 10-minute 15-second default-path run with controls, Randomize, and resizing
held 39.7 produced FPS, presented 17,458 frames, coalesced 6,947 obsolete worker
frames, and recorded zero main-thread queue drops or fresh browser errors. The
Chromium heap returned near its warmed baseline after normal collection cycles
(about +2.7 MB from start to finish), with no progressive slowdown or terminal
corruption observed.

Firefox was not available on the test host and remains an explicit validation
gap before declaring this a permanent cross-browser demo. Safari was not tested.
