#!/usr/bin/env node
/**
 * build-assets.mjs — generates every SVG in ../assets that README.md renders.
 *
 *   node scripts/build-assets.mjs
 *
 * Zero dependencies. Everything the profile shows is produced here, so editing a
 * job title, a stack entry or an award means editing the data blocks below and
 * re-running — never hand-patching SVG.
 *
 * Constraints that shape the output (GitHub renders these through camo, as
 * <img>-embedded SVG documents with `default-src 'none'; style-src 'unsafe-inline'`):
 *
 *   1. No external fonts can load. Text renders in whatever the viewer's system
 *      supplies, so every string is either centred (`text-anchor`) or laid out
 *      glyph-by-glyph from the metric table below — never trusted to land at a
 *      fixed width. Metrics are calibrated to DejaVu Sans, the widest realistic
 *      fallback, so boxes are sized generously rather than clipped.
 *   2. Animation is CSS, not SMIL, so `prefers-reduced-motion` actually applies.
 *      Every animation moves between two *visible* states: with all animation
 *      stripped, the static frame is the finished design.
 *   3. Clicks inside an <img> do not navigate, so anything clickable is its own
 *      file wrapped in an <a> by README.md.
 *   4. Cards are self-contained dark surfaces rather than theme-switched pairs.
 *      `prefers-color-scheme` follows the OS, not the GitHub theme toggle, so a
 *      light/dark pair breaks for anyone whose two settings disagree.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICONS } from './icons.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
mkdirSync(OUT, { recursive: true })

/* ══════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ══════════════════════════════════════════════════════════════════ */

const C = {
  bg: '#0A0A0F',
  bgLift: '#0E0E17',
  surface: '#12121D',
  surfaceHi: '#171726',
  line: '#232338',
  lineSoft: '#1A1A2A',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  lilac: '#A78BFA',
  hi: '#EDEDF7',
  mid: '#A9AECC',
  low: '#6E7295',
  dim: '#4A4E68',
  ghost: '#2A2A42',
  glyph: '#B9BEDC',
}

const SANS = "'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif"

/** Full design width. GitHub's profile column is ~870px, so this downscales a
 *  touch rather than being upscaled — keeps hairlines crisp. */
const W = 900

/* ══════════════════════════════════════════════════════════════════
   TEXT METRICS — DejaVu Sans advance widths as a fraction of the em.
   Deliberately the widest common fallback: boxes sized from these have
   slack under Segoe UI / Helvetica rather than overflowing.
   ══════════════════════════════════════════════════════════════════ */

const ADV = {
  A: 0.684, B: 0.686, C: 0.698, D: 0.770, E: 0.632, F: 0.575, G: 0.775, H: 0.765,
  I: 0.295, J: 0.295, K: 0.684, L: 0.575, M: 0.887, N: 0.765, O: 0.801, P: 0.657,
  Q: 0.801, R: 0.707, S: 0.659, T: 0.622, U: 0.750, V: 0.684, W: 0.989, X: 0.677,
  Y: 0.622, Z: 0.659,
  a: 0.613, b: 0.636, c: 0.550, d: 0.636, e: 0.615, f: 0.352, g: 0.636, h: 0.634,
  i: 0.278, j: 0.278, k: 0.579, l: 0.278, m: 0.974, n: 0.634, o: 0.612, p: 0.636,
  q: 0.636, r: 0.411, s: 0.521, t: 0.392, u: 0.634, v: 0.592, w: 0.818, x: 0.592,
  y: 0.592, z: 0.525,
  0: 0.636, 1: 0.636, 2: 0.636, 3: 0.636, 4: 0.636, 5: 0.636, 6: 0.636, 7: 0.636,
  8: 0.636, 9: 0.636,
  ' ': 0.318, '.': 0.318, ',': 0.318, ':': 0.337, ';': 0.337, '-': 0.361,
  '–': 0.636, '—': 0.995, '·': 0.318, '/': 0.337, '\\': 0.337,
  "'": 0.268, '"': 0.457, '(': 0.390, ')': 0.390, '[': 0.390, ']': 0.390,
  '+': 0.838, '&': 0.778, '#': 0.838, '@': 1.110, '!': 0.352, '?': 0.522,
  '%': 1.012, '*': 0.448, '=': 0.838, '_': 0.500, '★': 0.850,
}
const ADV_FALLBACK = 0.62
const BOLD_FACTOR = 1.06

/** Visible ink width of `s`. `tracking` is per-gap, so n-1 gaps. */
function textW (s, size, { bold = false, tracking = 0 } = {}) {
  let em = 0
  for (const ch of s) em += ADV[ch] ?? ADV_FALLBACK
  return em * size * (bold ? BOLD_FACTOR : 1) + tracking * Math.max(0, [...s].length - 1)
}

/* ══════════════════════════════════════════════════════════════════
   PRIMITIVES
   ══════════════════════════════════════════════════════════════════ */

const n = (v, p = 2) => {
  const r = Number(v.toFixed(p))
  return Object.is(r, -0) ? 0 : r
}
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A single <text> run.
 *
 * SVG letter-spacing adds a gap after the final glyph too, so the advance the
 * anchor centres on is wider than the visible ink. Shift by half (middle) or a
 * full gap (end) to put the *ink* where the caller asked for it.
 */
function txt (s, {
  x, y, size = 13, fill = C.mid, weight = 400, tracking = 0,
  anchor = 'start', opacity, cls, family = SANS,
}) {
  let ax = x
  if (tracking) {
    if (anchor === 'middle') ax += tracking / 2
    else if (anchor === 'end') ax += tracking
  }
  const a = [
    `x="${n(ax)}"`, `y="${n(y)}"`,
    `font-family="${family}"`, `font-size="${n(size)}"`, `fill="${fill}"`,
  ]
  if (weight !== 400) a.push(`font-weight="${weight}"`)
  if (tracking) a.push(`letter-spacing="${n(tracking)}"`)
  if (anchor !== 'start') a.push(`text-anchor="${anchor}"`)
  if (opacity != null) a.push(`opacity="${opacity}"`)
  if (cls) a.push(`class="${cls}"`)
  return `<text ${a.join(' ')}>${esc(s)}</text>`
}

/**
 * Heavily tracked display text, one <text> per glyph.
 *
 * Each glyph is centred inside a slot sized from the metric table, so a
 * narrower real font widens the gaps uniformly instead of drifting the whole
 * run off-centre. This is what makes the wordmark safe without `textLength`,
 * whose trailing-letter-spacing behaviour differs between Chrome and Firefox.
 */
function trackedText (s, { cx, y, size, fill, weight = 700, tracking = 0 }) {
  const chars = [...s]
  const slots = chars.map(ch =>
    (ADV[ch] ?? ADV_FALLBACK) * size * (weight >= 600 ? BOLD_FACTOR : 1))
  const total = slots.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  let x = cx - total / 2
  const out = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== ' ') {
      out.push(txt(chars[i], { x: x + slots[i] / 2, y, size, fill, weight, anchor: 'middle' }))
    }
    x += slots[i] + tracking
  }
  return out.join('')
}

const rect = (x, y, w, h, {
  r = 0, fill = 'none', stroke, sw = 1, opacity, fillOpacity, strokeOpacity, cls,
} = {}) => {
  const a = [`x="${n(x)}"`, `y="${n(y)}"`, `width="${n(w)}"`, `height="${n(h)}"`]
  if (r) a.push(`rx="${n(r)}"`)
  a.push(`fill="${fill}"`)
  if (fillOpacity != null) a.push(`fill-opacity="${fillOpacity}"`)
  if (stroke) a.push(`stroke="${stroke}"`, `stroke-width="${n(sw)}"`)
  if (strokeOpacity != null) a.push(`stroke-opacity="${strokeOpacity}"`)
  if (opacity != null) a.push(`opacity="${opacity}"`)
  if (cls) a.push(`class="${cls}"`)
  return `<rect ${a.join(' ')}/>`
}

/** Crisp 1px hairline: half-pixel offset keeps it from smearing across two rows. */
const hline = (x1, x2, y, { stroke = C.lineSoft, opacity } = {}) =>
  `<line x1="${n(x1)}" y1="${n(y) + 0.5}" x2="${n(x2)}" y2="${n(y) + 0.5}" stroke="${stroke}" stroke-width="1"${
    opacity != null ? ` opacity="${opacity}"` : ''}/>`

/** A card whose 1px border sits inside the declared box, so nothing clips. */
const card = (x, y, w, h, {
  r = 14, fill = C.surface, stroke = C.line, strokeOpacity, cls, fillOpacity,
} = {}) =>
  rect(x + 0.5, y + 0.5, w - 1, h - 1, { r, fill, stroke, sw: 1, strokeOpacity, cls, fillOpacity })

/* ── brand glyphs (Simple Icons, 24×24) ───────────────────────────── */

function icon (slug, x, y, size, fill, opacity) {
  const d = ICONS[slug]
  if (!d) throw new Error(`unknown brand icon: ${slug}`)
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24, 5)})">` +
    `<path d="${d}" fill="${fill}"${opacity != null ? ` opacity="${opacity}"` : ''}/></g>`
}

/* ── drawn glyphs — authored here rather than borrowed, all in 24×24 ── */

const GLYPH = {
  trophy: 'M7.2 4.6 H16.8 V9.2 A4.8 4.8 0 0 1 7.2 9.2 Z M7.2 6 H4.9 A2.3 2.3 0 0 0 7.5 9.7 M16.8 6 H19.1 A2.3 2.3 0 0 1 16.5 9.7 M12 14 V17.2 M10.2 17.2 H13.8 M8.4 19.7 H15.6',
  // Concentric disc, not a ribboned medal: at 18px the ribbons turned to mush.
  medal: 'M12 12 m -6.9 0 a 6.9 6.9 0 1 0 13.8 0 a 6.9 6.9 0 1 0 -13.8 0 M12 12 m -2.7 0 a 2.7 2.7 0 1 0 5.4 0 a 2.7 2.7 0 1 0 -5.4 0',
  diamond: 'M12 3.8 L20.2 12 L12 20.2 L3.8 12 Z',
  hexagon: 'M12 3.6 L19.27 7.8 V16.2 L12 20.4 L4.73 16.2 V7.8 Z',
  ring: 'M12 12 m -7 0 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0',
  cube: 'M12 3.2 L20 7.6 V16.4 L12 20.8 L4 16.4 V7.6 Z M4 7.6 L12 12 L20 7.6 M12 12 V20.8',
  layers: 'M12 3.6 L20.6 8 L12 12.4 L3.4 8 Z M3.4 12 L12 16.4 L20.6 12 M3.4 16 L12 20.4 L20.6 16',
  terminal: 'M5 4.6 H19 A1.6 1.6 0 0 1 20.6 6.2 V17.8 A1.6 1.6 0 0 1 19 19.4 H5 A1.6 1.6 0 0 1 3.4 17.8 V6.2 A1.6 1.6 0 0 1 5 4.6 Z M7.7 9.7 L10.7 12.2 L7.7 14.7 M13 15.1 H16.6',
  arrow: 'M7.8 16.2 L16.2 7.8 M9.6 7.8 H16.2 V14.4',
  pin: 'M12 21 C12 21 19 14.7 19 9.9 A7 7 0 1 0 5 9.9 C5 14.7 12 21 12 21 Z M12 12.3 m -2.6 0 a 2.6 2.6 0 1 0 5.2 0 a 2.6 2.6 0 1 0 -5.2 0',
}

/** Filled sparkle — the only glyph that reads better solid than stroked. */
const SPARK = 'M12 3 C12.7 8.4 15.6 11.3 21 12 C15.6 12.7 12.7 15.6 12 21 C11.3 15.6 8.4 12.7 3 12 C8.4 11.3 11.3 8.4 12 3 Z'
const STAR = 'M12 3.6 L14.12 9.09 L19.99 9.4 L15.42 13.11 L16.94 18.8 L12 15.6 L7.06 18.8 L8.58 13.11 L4.01 9.4 L9.88 9.09 Z'

function glyph (d, x, y, size, { stroke = C.glyph, sw = 1.7, fill = 'none', opacity } = {}) {
  const s = size / 24
  const a = [`d="${d}"`, `fill="${fill}"`]
  if (stroke) a.push(`stroke="${stroke}"`, `stroke-width="${n(sw)}"`, 'stroke-linecap="round"', 'stroke-linejoin="round"')
  if (opacity != null) a.push(`opacity="${opacity}"`)
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s, 5)})"><path ${a.join(' ')}/></g>`
}

/* ── document shell ───────────────────────────────────────────────── */

function doc (w, h, body, { defs = '', style = '' } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" fill="none" role="img">`,
    defs ? `<defs>${defs}</defs>` : '',
    style ? `<style>${style}</style>` : '',
    body,
    '</svg>',
  ].filter(Boolean).join('\n') + '\n'
}

const written = []
function emit (name, svg) {
  writeFileSync(join(OUT, name), svg, 'utf8')
  written.push([name, svg.length])
}

/* ══════════════════════════════════════════════════════════════════
   SHARED FRAGMENTS
   ══════════════════════════════════════════════════════════════════ */

/** Faint ruled grid, clipped to the card it decorates. */
function grid (w, h, { step = 30, clip, stroke = '#FFFFFF', opacity = 0.022 } = {}) {
  const p = []
  for (let x = step; x < w; x += step) p.push(`M${x} 0V${n(h)}`)
  for (let y = step; y < h; y += step) p.push(`M0 ${y}H${n(w)}`)
  return `<g${clip ? ` clip-path="url(#${clip})"` : ''} opacity="${opacity}">` +
    `<path d="${p.join('')}" stroke="${stroke}" stroke-width="1"/></g>`
}

/** L-shaped corner ticks — a quiet editorial frame. */
function cornerTicks (x, y, w, h, { len = 13, inset = 16, stroke = C.violet, opacity = 0.45 } = {}) {
  const l = x + inset, r = x + w - inset, t = y + inset, b = y + h - inset
  const d = [
    `M${n(l)} ${n(t + len)}V${n(t)}H${n(l + len)}`,
    `M${n(r - len)} ${n(t)}H${n(r)}V${n(t + len)}`,
    `M${n(r)} ${n(b - len)}V${n(b)}H${n(r - len)}`,
    `M${n(l + len)} ${n(b)}H${n(l)}V${n(b - len)}`,
  ].join('')
  return `<path d="${d}" stroke="${stroke}" stroke-width="1.2" opacity="${opacity}" fill="none" stroke-linecap="round"/>`
}

/**
 * Pill with a pulsing dot. The dot's own opacity is 1 and the halo is a second
 * element, so with animation disabled the pill still reads as complete.
 */
function statusPill (cx, top, label, { size = 10, tracking = 2.8, h = 27 } = {}) {
  const tw = textW(label, size, { bold: true, tracking })
  const w = 15 + 7 + 8 + tw + 16
  const x = cx - w / 2
  const cy = top + h / 2
  return [
    rect(x, top, w, h, { r: h / 2, fill: C.violet, fillOpacity: 0.07, stroke: C.violet, strokeOpacity: 0.32 }),
    `<circle cx="${n(x + 15)}" cy="${n(cy)}" r="3.4" fill="${C.lilac}" opacity="0.28" class="halo"/>`,
    `<circle cx="${n(x + 15)}" cy="${n(cy)}" r="3.4" fill="${C.lilac}" class="pulse"/>`,
    txt(label, { x: x + 15 + 7 + 8, y: cy + size * 0.35, size, fill: C.lilac, weight: 700, tracking }),
  ].join('')
}

/** Pill fronted by a drawn glyph rather than a dot — used for the credential. */
function glyphPill (cx, top, d, label, { size = 10, tracking = 2.8, h = 28, gs = 15 } = {}) {
  const tw = textW(label, size, { bold: true, tracking })
  const w = 15 + gs + 9 + tw + 17
  const x = cx - w / 2
  const cy = top + h / 2
  return [
    rect(x, top, w, h, { r: h / 2, fill: C.violet, fillOpacity: 0.08, stroke: 'url(#pillStroke)' }),
    glyph(d, x + 14, cy - gs / 2, gs, { stroke: C.lilac, sw: 1.9 }),
    txt(label, { x: x + 15 + gs + 9, y: cy + size * 0.35, size, fill: C.lilac, weight: 700, tracking }),
  ].join('')
}

const MOTION = (rules, disable) => `
${rules}
@media (prefers-reduced-motion: reduce){${disable}{animation:none}}`

const PULSE_CSS = `
@keyframes bp{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes bh{0%{opacity:.28;r:3.4}70%{opacity:0;r:9}100%{opacity:0;r:9}}
.pulse{animation:bp 2.8s ease-in-out infinite}
.halo{animation:bh 2.8s ease-out infinite}`

/* ══════════════════════════════════════════════════════════════════
   01 · HERO
   ══════════════════════════════════════════════════════════════════ */

function buildHero () {
  const H = 282
  const cx = W / 2

  const defs = `
<clipPath id="hc"><rect x="0" y="0" width="${W}" height="${H}" rx="18"/></clipPath>
<linearGradient id="hbg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#0B0B12"/><stop offset="0.5" stop-color="#0A0A0F"/><stop offset="1" stop-color="#0C0A14"/>
</linearGradient>
<radialGradient id="ga" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="${C.indigo}" stop-opacity="0.32"/><stop offset="1" stop-color="${C.indigo}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="gb" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="pillStroke" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.indigo}" stop-opacity="0.35"/>
</linearGradient>
<linearGradient id="wm" x1="${cx}" y1="107" x2="${cx}" y2="158" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFC7F4"/>
</linearGradient>
<linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0"/><stop offset="0.5" stop-color="${C.violet}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
</linearGradient>
<linearGradient id="topline" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${C.indigo}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.indigo}" stop-opacity="0.7"/><stop offset="0.65" stop-color="${C.violet}" stop-opacity="0.7"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
</linearGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
<feColorMatrix type="saturate" values="0"/>
</filter>`

  // Both glows start untransformed and merely drift — the still frame is complete.
  const style = MOTION(`
@keyframes da{0%,100%{transform:translate(0,0)}50%{transform:translate(46px,-16px)}}
@keyframes db{0%,100%{transform:translate(0,0)}50%{transform:translate(-38px,14px)}}
.ga{animation:da 24s ease-in-out infinite}
.gb{animation:db 19s ease-in-out infinite}`, '.ga,.gb')

  const roles = 'Full-Stack Engineer  ·  Blockchain Engineer  ·  AI Engineer'

  // Pin + city measured as one unit so the pair sits optically centred.
  const city = 'HO CHI MINH CITY, VIETNAM'
  const cityTrack = 3.4
  const cityW = textW(city, 10.5, { bold: true, tracking: cityTrack })
  const cityStart = cx - (13 + 7 + cityW) / 2

  const body = `
<rect width="${W}" height="${H}" rx="18" fill="url(#hbg)"/>
<g clip-path="url(#hc)">
  <g class="ga"><ellipse cx="182" cy="34" rx="330" ry="188" fill="url(#ga)"/></g>
  <g class="gb"><ellipse cx="762" cy="262" rx="330" ry="182" fill="url(#gb)"/></g>
  ${grid(W, H, { step: 30, clip: 'hc', opacity: 0.02 })}
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.05"/>
  <rect x="1" y="0" width="${W - 2}" height="1.4" fill="url(#topline)"/>
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="${C.line}"/>
${cornerTicks(0, 0, W, H, { inset: 18, len: 12, opacity: 0.4 })}
${glyphPill(cx, 39, GLYPH.trophy, 'MAMMOTHON 2025 CHAMPION')}
${trackedText('LE PHI ANH', { cx, y: 152, size: 58, fill: 'url(#wm)', weight: 700, tracking: 15 })}
${txt(roles, { x: cx, y: 186, size: 14, fill: C.mid, weight: 500, tracking: 1.9, anchor: 'middle' })}
<rect x="${n(cx - 90)}" y="208" width="180" height="1.4" rx="0.7" fill="url(#rule)"/>
${glyph(GLYPH.pin, cityStart, 225, 13, { stroke: C.low, sw: 2 })}
${txt(city, { x: cityStart + 13 + 7, y: 236, size: 10.5, fill: C.low, weight: 600, tracking: cityTrack })}`

  emit('hero.svg', doc(W, H, body, { defs, style }))
}

/* ══════════════════════════════════════════════════════════════════
   02 · BUTTONS  (separate files so README.md can wrap each in <a>)
   ══════════════════════════════════════════════════════════════════ */

const PAD = 4 // transparent gutter; GitHub's own inter-image whitespace adds ~4px

function buildPrimaryButton (name, label, glyphSpec, accent) {
  const H = 46
  const size = 13
  const tw = textW(label, size, { bold: true, tracking: 0.4 })
  const inner = 18 + 17 + 10 + tw + 18
  const w = inner + PAD * 2
  const cy = H / 2

  const defs = `
<linearGradient id="pf" x1="0" y1="0" x2="${n(inner)}" y2="${H}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#181830"/><stop offset="1" stop-color="#131322"/>
</linearGradient>
<linearGradient id="ps" x1="0" y1="0" x2="${n(inner)}" y2="${H}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${C.indigo}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0.5"/>
</linearGradient>`

  const mark = glyphSpec.brand
    ? icon(glyphSpec.brand, PAD + 18, cy - 8.5, 17, accent)
    : glyph(glyphSpec.d, PAD + 18, cy - 8.5, 17, { stroke: accent, sw: 2 })

  const body = `
${rect(PAD + 0.5, 0.5, inner - 1, H - 1, { r: 12.5, fill: 'url(#pf)', stroke: 'url(#ps)' })}
${mark}
${txt(label, { x: PAD + 18 + 17 + 10, y: cy + 4.6, size, fill: C.hi, weight: 600, tracking: 0.4 })}`

  emit(name, doc(Math.ceil(w), H, body, { defs }))
  return { w: Math.ceil(w), h: H }
}

function buildSocialButton (name, slug) {
  const S = 46
  const w = S + PAD * 2
  const body = `
${rect(PAD + 0.5, 0.5, S - 1, S - 1, { r: 13, fill: C.surface, stroke: C.line })}
${icon(slug, PAD + (S - 18) / 2, (S - 18) / 2, 18, C.glyph)}`
  emit(name, doc(w, S, body))
  return { w, h: S }
}

/* ══════════════════════════════════════════════════════════════════
   03 · SECTION HEADERS
   ══════════════════════════════════════════════════════════════════ */

/**
 * Section headers carry their own dark surface. An earlier transparent version
 * put near-white type straight onto the page — invisible on GitHub's light
 * theme. Every asset in this system is a self-contained dark plate for exactly
 * that reason.
 */
function buildSectionHeader (name, num, title, kicker) {
  const H = 48
  const base = 30
  const padX = 22
  const numSize = 12
  const titleSize = 15

  const markX = padX
  const numX = markX + 3 + 12
  const numW = textW(num, numSize, { bold: true, tracking: 1.4 })
  const slashX = numX + numW + 11
  const slashW = textW('/', 12)
  const titleX = slashX + slashW + 11
  const titleW = textW(title, titleSize, { bold: true, tracking: 3.8 })
  const ruleStart = titleX + titleW + 22

  const right = []
  if (kicker) {
    const kw = textW(kicker, 9.5, { bold: true, tracking: 2.2 })
    right.push(txt(kicker, { x: W - padX, y: base - 1, size: 9.5, fill: C.dim, weight: 700, tracking: 2.2, anchor: 'end' }))
    right.push(hline(ruleStart, W - padX - kw - 20, base - 6, { stroke: C.line }))
  } else {
    right.push(hline(ruleStart, W - padX, base - 6, { stroke: C.line }))
  }

  const defs = `
<linearGradient id="mk" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${C.indigo}"/><stop offset="1" stop-color="${C.violet}"/>
</linearGradient>`

  const body = `
${rect(0.5, 0.5, W - 1, H - 1, { r: 12, fill: C.bgLift, stroke: C.line })}
${rect(markX, base - 14, 3, 17, { r: 1.5, fill: 'url(#mk)' })}
${txt(num, { x: numX, y: base, size: numSize, fill: C.violet, weight: 700, tracking: 1.4 })}
${txt('/', { x: slashX, y: base, size: 12, fill: C.dim })}
${txt(title, { x: titleX, y: base, size: titleSize, fill: C.hi, weight: 700, tracking: 3.8 })}
${right.join('')}`

  emit(name, doc(W, H, body, { defs }))
}

/* ══════════════════════════════════════════════════════════════════
   04 · FOCUS CARDS
   ══════════════════════════════════════════════════════════════════ */

const FOCUS = [
  { g: SPARK, filled: true, t: 'AI & Applied ML', d: ['Computer vision, LLM apps,', 'and AI-assisted tooling.'] },
  { g: GLYPH.cube, t: 'Blockchain & Web3', d: ['Smart contracts, on-chain', 'products and NFT systems.'] },
  { g: GLYPH.layers, t: 'Full-Stack Product', d: ['End-to-end web platforms,', 'from schema to interface.'] },
  { g: GLYPH.terminal, t: 'Systems & Automation', d: ['Bots, desktop control and', 'low-level Windows tooling.'] },
]

function buildFocus () {
  const H = 122
  const gap = 14
  const cw = (W - gap * (FOCUS.length - 1)) / FOCUS.length

  const defs = `
<linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${C.indigo}" stop-opacity="0.20"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0.10"/>
</linearGradient>`

  const parts = FOCUS.map((f, i) => {
    const x = i * (cw + gap)
    const mark = f.filled
      ? glyph(f.g, x + 22, 22, 17, { stroke: null, fill: C.lilac })
      : glyph(f.g, x + 22, 22, 17, { stroke: C.lilac, sw: 1.8 })
    return [
      card(x, 0, cw, H, { r: 14 }),
      rect(x + 18, 18, 26, 26, { r: 8, fill: 'url(#fg)', stroke: C.violet, strokeOpacity: 0.24 }),
      mark,
      txt(String(i + 1).padStart(2, '0'), { x: x + cw - 18, y: 34, size: 10.5, fill: C.ghost, weight: 700, tracking: 1.2, anchor: 'end' }),
      txt(f.t, { x: x + 18, y: 72, size: 13, fill: C.hi, weight: 600, tracking: 0.2 }),
      txt(f.d[0], { x: x + 18, y: 92, size: 11, fill: C.low }),
      txt(f.d[1], { x: x + 18, y: 106, size: 11, fill: C.low }),
    ].join('')
  })

  emit('focus.svg', doc(W, H, parts.join('\n'), { defs }))
}

/* ══════════════════════════════════════════════════════════════════
   05 · STACK
   ══════════════════════════════════════════════════════════════════ */

const STACK = [
  ['FRONTEND', [['TypeScript', 'typescript'], ['React', 'react'], ['Next.js', 'nextdotjs'], ['Tailwind CSS', 'tailwindcss'], ['shadcn/ui', 'shadcnui']]],
  ['BACKEND', [['Node.js', 'nodedotjs'], ['NestJS', 'nestjs'], ['Express', 'express'], ['Gin', 'gin'], ['FastAPI', 'fastapi']]],
  ['DATA', [['PostgreSQL', 'postgresql'], ['MySQL', 'mysql'], ['MariaDB', 'mariadb'], ['MongoDB', 'mongodb'], ['SQLite', 'sqlite']]],
  ['INFRA', [['Linux', 'linux'], ['Docker', 'docker'], ['Nginx', 'nginx'], ['AWS', 'amazonwebservices'], ['Vercel', 'vercel']]],
  ['TOOLS', [['Git', 'git'], ['Postman', 'postman'], ['Jira', 'jira']]],
]

function buildStack () {
  const padX = 30
  const padTop = 26
  const rowH = 54
  const labelW = 128
  const chipsX = padX + labelW
  const H = padTop + STACK.length * rowH + 22

  const chipH = 31
  const chipR = 9
  const iconSize = 15
  const fontSize = 12.5
  const chipPadL = 13
  const chipPadR = 14
  const iconGap = 8
  const chipGap = 9

  const parts = [
    rect(0.5, 0.5, W - 1, H - 1, { r: 16, fill: C.bgLift, stroke: C.line }),
  ]

  STACK.forEach(([label, items], ri) => {
    const top = padTop + ri * rowH
    const cy = top + rowH / 2
    if (ri > 0) parts.push(hline(padX, W - padX, top, { stroke: C.lineSoft }))
    parts.push(txt(label, { x: padX, y: cy + 3.6, size: 10, fill: C.low, weight: 700, tracking: 2.4 }))

    let x = chipsX
    for (const [name, slug] of items) {
      const tw = textW(name, fontSize, { tracking: 0.15 })
      const cw = chipPadL + iconSize + iconGap + tw + chipPadR
      parts.push(
        rect(x + 0.5, cy - chipH / 2 + 0.5, cw - 1, chipH - 1, { r: chipR, fill: C.surface, stroke: C.line }),
        icon(slug, x + chipPadL, cy - iconSize / 2, iconSize, C.glyph, 0.92),
        txt(name, { x: x + chipPadL + iconSize + iconGap, y: cy + fontSize * 0.35, size: fontSize, fill: C.mid, weight: 500, tracking: 0.15 }),
      )
      x += cw + chipGap
    }
    if (x - chipGap > W - padX) {
      console.warn(`  ! stack row "${label}" overflows: ${n(x - chipGap)} > ${W - padX}`)
    }
  })

  emit('stack.svg', doc(W, H, parts.join('\n')))
}

/* ══════════════════════════════════════════════════════════════════
   06 · AWARDS
   ══════════════════════════════════════════════════════════════════ */

const CHAMPION = { rank: 'CHAMPION', event: 'Mammothon — Celestia Hackathon Vietnam', year: '2025' }

const PLACED = [
  { g: GLYPH.medal, rank: '3RD PLACE', event: 'Fintech Blockchain Hackathon', sub: '2025' },
  { g: STAR, filled: true, rank: "PEOPLE'S CHOICE AWARD", event: 'AI Innovation Challenge', sub: '2025' },
  { g: GLYPH.diamond, rank: 'TOP 20 FINALIST', event: 'Artificial Intelligence Olympiad', sub: 'OAI Ho Chi Minh City · 2025' },
  { g: GLYPH.hexagon, rank: 'SEMIFINALIST', event: 'Vietnam Blockchain Talent Search', sub: 'VietChain Talents · 2025' },
]

const CONSOLATION = { rank: 'CONSOLATION PRIZE', event: 'Hackathon Pione Dream', year: '2025' }

const ALSO = ['GDG on Campus Hackathon Vietnam', 'AI+ Unlimited Future', 'K-Tech AI Hackathon']

function buildAwards () {
  const gap = 14
  const heroH = 118
  const cardH = 96
  const slimH = 62
  const alsoH = 34
  const colW = (W - gap) / 2
  const H = heroH + gap + cardH + gap + cardH + gap + slimH + gap + alsoH

  const defs = `
<clipPath id="ac"><rect x="0" y="0" width="${W}" height="${heroH}" rx="16"/></clipPath>
<linearGradient id="af" x1="0" y1="0" x2="${W}" y2="${heroH}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#15132A"/><stop offset="0.55" stop-color="#111020"/><stop offset="1" stop-color="#0D0C16"/>
</linearGradient>
<linearGradient id="as" x1="0" y1="0" x2="${W}" y2="${heroH}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0.85"/><stop offset="0.5" stop-color="${C.indigo}" stop-opacity="0.42"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0.28"/>
</linearGradient>
<radialGradient id="aglow" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0.42"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="abox" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0.26"/><stop offset="1" stop-color="${C.indigo}" stop-opacity="0.12"/>
</linearGradient>
<linearGradient id="mk2" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.indigo}"/>
</linearGradient>`

  const style = MOTION(`
@keyframes ag{0%,100%{opacity:.85}50%{opacity:.45}}
.ag{animation:ag 7s ease-in-out infinite}`, '.ag')

  /* ── champion ── */
  const chX = 118
  const parts = [
    `<rect width="${W}" height="${heroH}" rx="16" fill="url(#af)"/>`,
    `<g clip-path="url(#ac)"><ellipse cx="86" cy="${heroH / 2}" rx="250" ry="132" fill="url(#aglow)" class="ag"/>` +
      grid(W, heroH, { step: 30, clip: 'ac', opacity: 0.018 }) + '</g>',
    rect(0.5, 0.5, W - 1, heroH - 1, { r: 15.5, fill: 'none', stroke: 'url(#as)', sw: 1.4 }),
    rect(26, 28, 68, 68, { r: 19, fill: 'url(#abox)', stroke: C.violet, strokeOpacity: 0.42 }),
    glyph(GLYPH.trophy, 26 + 15, 28 + 15, 38, { stroke: C.lilac, sw: 1.6 }),
    txt(CHAMPION.rank, { x: chX, y: 52, size: 11, fill: C.lilac, weight: 700, tracking: 3.6 }),
    txt(CHAMPION.event, { x: chX, y: 83, size: 21, fill: C.hi, weight: 700, tracking: 0.1 }),
    txt(CHAMPION.year, { x: W - 34, y: 80, size: 34, fill: C.ghost, weight: 700, tracking: 1.5, anchor: 'end' }),
  ]

  /* ── four placements ── */
  PLACED.forEach((a, i) => {
    const x = (i % 2) * (colW + gap)
    const y = heroH + gap + Math.floor(i / 2) * (cardH + gap)
    const mark = a.filled
      ? glyph(a.g, x + 20 + 8, y + 31 + 8, 18, { stroke: null, fill: C.lilac })
      : glyph(a.g, x + 20 + 8, y + 31 + 8, 18, { stroke: C.lilac, sw: 1.8 })
    parts.push(
      card(x, y, colW, cardH, { r: 14 }),
      rect(x + 20, y + 31, 34, 34, { r: 11, fill: C.violet, fillOpacity: 0.08, stroke: C.violet, strokeOpacity: 0.2 }),
      mark,
      txt(a.rank, { x: x + 70, y: y + 40, size: 10, fill: C.lilac, weight: 700, tracking: 2.5 }),
      txt(a.event, { x: x + 70, y: y + 63, size: 13.5, fill: C.hi, weight: 600 }),
      txt(a.sub, { x: x + 70, y: y + 80, size: 11, fill: C.low, tracking: 0.5 }),
    )
    const widest = Math.max(textW(a.event, 13.5, { bold: true }), textW(a.rank, 10, { bold: true, tracking: 2.5 }))
    if (70 + widest > colW - 20) console.warn(`  ! award card "${a.rank}" overflows by ${n(70 + widest - (colW - 20))}px`)
  })

  /* ── consolation ── */
  const sy = heroH + gap + cardH * 2 + gap * 2
  const rankW = textW(CONSOLATION.rank, 10, { bold: true, tracking: 2.5 })
  parts.push(
    card(0, sy, W, slimH, { r: 13, fill: C.bgLift, stroke: C.lineSoft }),
    glyph(GLYPH.ring, 24, sy + slimH / 2 - 9, 18, { stroke: C.low, sw: 1.8 }),
    txt(CONSOLATION.rank, { x: 58, y: sy + 36, size: 10, fill: C.mid, weight: 700, tracking: 2.5 }),
    `<line x1="${n(58 + rankW + 16)}" y1="${n(sy + 22)}" x2="${n(58 + rankW + 16)}" y2="${n(sy + 40)}" stroke="${C.line}" stroke-width="1"/>`,
    txt(CONSOLATION.event, { x: 58 + rankW + 32, y: sy + 36, size: 13, fill: C.hi, weight: 600 }),
    txt(CONSOLATION.year, { x: W - 26, y: sy + 36, size: 11, fill: C.low, weight: 600, tracking: 1.4, anchor: 'end' }),
  )

  /* ── also competed — flattest tier, still on its own dark plate so it stays
        legible against GitHub's light theme ── */
  const ay = sy + slimH + gap
  const lbl = 'ALSO COMPETED'
  const lblW = textW(lbl, 9.5, { bold: true, tracking: 2.4 })
  const lblX = 24
  parts.push(
    rect(0, ay, W, alsoH, { r: 10, fill: C.bg }),
    rect(lblX - 12, ay + (alsoH - 15) / 2, 3, 15, { r: 1.5, fill: 'url(#mk2)', opacity: 0.75 }),
    txt(lbl, { x: lblX, y: ay + alsoH / 2 + 3.4, size: 9.5, fill: C.dim, weight: 700, tracking: 2.4 }),
    txt(ALSO.join('   ·   '), { x: lblX + lblW + 22, y: ay + alsoH / 2 + 4, size: 11.5, fill: C.low, tracking: 0.2 }),
  )
  const alsoTotal = lblX + lblW + 22 + textW(ALSO.join('   ·   '), 11.5, { tracking: 0.2 }) + 24
  if (alsoTotal > W) console.warn(`  ! "also competed" row overflows by ${n(alsoTotal - W)}px`)

  emit('awards.svg', doc(W, H, parts.join('\n'), { defs, style }))
}

/* ══════════════════════════════════════════════════════════════════
   07 · FOOTER
   ══════════════════════════════════════════════════════════════════ */

/** Pin + city measured as one unit, so the pair centres optically. */
function footerCity (cx, y, { size = 11.5, tracking = 2.6, gs = 13 } = {}) {
  const label = 'HO CHI MINH CITY, VIETNAM'
  const tw = textW(label, size, { bold: true, tracking })
  const start = cx - (gs + 7 + tw) / 2
  return glyph(GLYPH.pin, start, y - gs + 2, gs, { stroke: C.low, sw: 2 }) +
    txt(label, { x: start + gs + 7, y, size, fill: C.low, weight: 600, tracking })
}

function buildFooter () {
  const H = 142
  const cx = W / 2

  const defs = `
<clipPath id="fc"><rect x="0" y="0" width="${W}" height="${H}" rx="16"/></clipPath>
<linearGradient id="ff" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#0C0A14"/><stop offset="0.5" stop-color="#0A0A0F"/><stop offset="1" stop-color="#0B0B12"/>
</linearGradient>
<radialGradient id="fglow" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0.34"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="ftop" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${C.violet}" stop-opacity="0"/><stop offset="0.5" stop-color="${C.violet}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
</linearGradient>`

  const style = MOTION(`${PULSE_CSS}
@keyframes fg{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-12px)}}
.fg{animation:fg 16s ease-in-out infinite}`, '.fg,.pulse,.halo')

  const body = `
<rect width="${W}" height="${H}" rx="16" fill="url(#ff)"/>
<g clip-path="url(#fc)">
  <g class="fg"><ellipse cx="${cx}" cy="${H + 18}" rx="360" ry="120" fill="url(#fglow)"/></g>
  ${grid(W, H, { step: 30, clip: 'fc', opacity: 0.016 })}
  <rect x="1" y="0" width="${W - 2}" height="1.4" fill="url(#ftop)"/>
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="${C.line}"/>
${cornerTicks(0, 0, W, H, { inset: 16, len: 11, opacity: 0.3 })}
${statusPill(cx, 30, 'OPEN TO OPPORTUNITIES')}
${txt('Available for full-time roles, freelance projects and collaboration.', { x: cx, y: 95, size: 15.5, fill: C.hi, weight: 600, anchor: 'middle' })}
${footerCity(cx, 118)}`

  emit('footer.svg', doc(W, H, body, { defs, style }))
}

/* ══════════════════════════════════════════════════════════════════
   RUN
   ══════════════════════════════════════════════════════════════════ */

buildHero()

const buttons = {}
buttons.portfolio = buildPrimaryButton('btn-portfolio.svg', 'Portfolio', { d: GLYPH.arrow }, C.lilac)
buttons.email = buildPrimaryButton('btn-email.svg', 'Email', { brand: 'gmail' }, C.lilac)
for (const [file, slug] of [
  ['soc-telegram.svg', 'telegram'], ['soc-x.svg', 'x'], ['soc-tiktok.svg', 'tiktok'],
  ['soc-linkedin.svg', 'linkedin'], ['soc-github.svg', 'github'], ['soc-reddit.svg', 'reddit'],
]) buttons[slug] = buildSocialButton(file, slug)

buildSectionHeader('sec-profile.svg', '01', 'PROFILE', 'WHO I AM')
buildSectionHeader('sec-stack.svg', '02', 'STACK', 'WHAT I BUILD WITH')
buildSectionHeader('sec-awards.svg', '03', 'AWARDS', 'COMPETITION RECORD')
buildSectionHeader('sec-activity.svg', '04', 'ACTIVITY', 'LIVE FROM GITHUB')

buildFocus()
buildStack()
buildAwards()
buildFooter()

const total = written.reduce((a, [, b]) => a + b, 0)
console.log(`${written.length} assets → ${OUT}`)
for (const [name, size] of written) console.log(`  ${name.padEnd(22)} ${String(Math.round(size / 1024)).padStart(4)} KB`)
console.log(`  ${'total'.padEnd(22)} ${String(Math.round(total / 1024)).padStart(4)} KB`)
console.log('\nbutton widths (for README img tags):')
for (const [k, v] of Object.entries(buttons)) console.log(`  ${k.padEnd(12)} ${v.w} x ${v.h}`)
