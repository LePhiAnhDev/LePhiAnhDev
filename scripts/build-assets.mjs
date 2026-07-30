#!/usr/bin/env node
/**
 * build-assets.mjs — generates every SVG in ../assets that README.md renders.
 *
 *   node scripts/build-assets.mjs
 *
 * Zero dependencies. Edit the data blocks below and re-run; never hand-patch SVG.
 *
 * ── RESPONSIVE: ATTEMPTED, AND IT CANNOT WORK ON GITHUB ─────────────
 * A narrow layout is fully implemented below (`stacked: true`) but is NOT
 * emitted, because the mechanism that would select it does not survive
 * GitHub's renderer. Do not re-enable it without re-reading this.
 *
 * GitHub auto-links any standalone image, and it does so INSIDE <picture>:
 *
 *     <picture>
 *       <source media="(max-width: 900px)" srcset="...-narrow.svg">
 *       <a href="..."><img src="...svg"></a>     <-- GitHub inserts this <a>
 *     </picture>
 *
 * Per spec <picture> only selects for an <img> that is its DIRECT child, so
 * with the <a> in between every <source> is inert. Tested four markup shapes —
 * title attribute, <div> instead of <p>, an author-supplied wrapping <a>, and a
 * trailing sibling — and GitHub inserted the link in all four. (Theme switching
 * still works because GitHub ships JS for it via <themed-picture>; that JS
 * handles prefers-color-scheme, not width.)
 *
 * The consequence is real and worth knowing: the profile column is ~293px on a
 * phone, so a 900px sheet renders its body type at roughly 4px. Measured
 * columns on the live profile — note this is NOT linear, GitHub's sidebar takes
 * width back partway up:
 *
 *     viewport  390   500   768   1012  1280  1512
 *     column    293   403   383    563   831   847
 *
 * No single design width fixes this: the span from 293 to 847 is 2.9x. The only
 * real remedy is native markdown for the body content, which trades the whole
 * visual system for reflow. That is a product decision, not a build flag.
 *
 * ── DESIGN RULES ────────────────────────────────────────────────────
 *   - No gradients, glows, blur, texture or shadows. Flat fills and 1px
 *     hairlines only. Depth comes from value, not effects.
 *   - One accent colour, in three semantic roles: the availability marker, the
 *     key figures, and the Champion row. Never for decoration.
 *   - Every text colour clears WCAG AA (4.5:1) on the surface it sits on. The
 *     ramp below is tuned for that; `npm`-free audit lives in the README notes.
 *   - Alignment does the work a gradient used to: the stack sits on a computed
 *     column grid and the awards on two, so columns line up down the page.
 *   - Monotony is a rhythm problem, not an effects problem. The page varies
 *     density deliberately: airy masthead, very airy key figures at 46px, dense
 *     awards table, medium stack grid.
 *
 * ── PLATFORM CONSTRAINTS ────────────────────────────────────────────
 * GitHub serves these from raw.githubusercontent.com under
 * `default-src 'none'; style-src 'unsafe-inline'; sandbox`:
 *
 *   1. No external font can load. Text renders in whatever the viewer has, so
 *      every string is anchored and every box is sized from the DejaVu Sans
 *      metric table below — the widest realistic fallback, so boxes keep slack
 *      under Segoe UI or Helvetica instead of clipping.
 *   2. Animation is CSS, not SMIL, so prefers-reduced-motion applies. The one
 *      animation moves between two visible states: strip every <style> block
 *      and the static frame is still the finished design.
 *   3. Clicks inside an <img> do not navigate, so each link is its own file
 *      that README.md wraps in an <a> (with a title, for a hover tooltip).
 *   4. Plates are self-contained dark surfaces, not <picture> theme pairs.
 *      prefers-color-scheme follows the OS, not GitHub's theme toggle, so a
 *      light/dark pair breaks whenever a reader's two settings disagree.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICONS } from './icons.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
mkdirSync(OUT, { recursive: true })

/* ══════════════════════════════════════════════════════════════════
   TOKENS — the neutral ramp is tuned so every step clears AA on #0F0F11
   ══════════════════════════════════════════════════════════════════ */

const C = {
  plate: '#0F0F11',
  plateAlt: '#141417',
  lead: '#1C1916', // champion row: a flat 7% accent tint, not a gradient
  line: '#26262A',
  lineSoft: '#1C1C1F',
  hi: '#F2F2F3', //  17.1 : 1
  text: '#C9C9CF', //  11.6 : 1
  mid: '#A5A5AC', //   7.8 : 1
  low: '#949499', //   6.4 : 1
  dim: '#7E7E87', //   4.9 : 1  — floor; nothing may be dimmer than this
  accent: '#C8A063', //   7.9 : 1
}

const SANS = "'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif"
const R = 6

/* ══════════════════════════════════════════════════════════════════
   TEXT METRICS — DejaVu Sans advance widths as a fraction of the em
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
  '–': 0.636, '—': 0.995, '·': 0.318, '/': 0.337,
  "'": 0.268, '"': 0.457, '(': 0.390, ')': 0.390, '[': 0.390, ']': 0.390,
  '+': 0.838, '&': 0.778, '#': 0.838, '@': 1.110, '!': 0.352, '?': 0.522,
  '%': 1.012, '*': 0.448, '=': 0.838, '_': 0.500,
}
const ADV_FALLBACK = 0.62
const BOLD = 1.06

function textW (s, size, { bold = false, tracking = 0 } = {}) {
  let em = 0
  for (const ch of s) em += ADV[ch] ?? ADV_FALLBACK
  return em * size * (bold ? BOLD : 1) + tracking * Math.max(0, [...s].length - 1)
}

/** Greedy word wrap against the metric table. Used by the narrow sheet. */
function wrap (s, maxW, size, opts = {}) {
  const words = s.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (cur && textW(next, size, opts) > maxW) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
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
 * A single <text> run. SVG letter-spacing also adds a gap after the final
 * glyph, so the advance the anchor centres on is wider than the visible ink;
 * shift by half a gap (middle) or a full gap (end) to land the ink correctly.
 */
function txt (s, { x, y, size = 13, fill = C.mid, weight = 400, tracking = 0, anchor = 'start', cls }) {
  let ax = x
  if (tracking) {
    if (anchor === 'middle') ax += tracking / 2
    else if (anchor === 'end') ax += tracking
  }
  const a = [`x="${n(ax)}"`, `y="${n(y)}"`, `font-family="${SANS}"`, `font-size="${n(size)}"`, `fill="${fill}"`]
  if (weight !== 400) a.push(`font-weight="${weight}"`)
  if (tracking) a.push(`letter-spacing="${n(tracking)}"`)
  if (anchor !== 'start') a.push(`text-anchor="${anchor}"`)
  if (cls) a.push(`class="${cls}"`)
  return `<text ${a.join(' ')}>${esc(s)}</text>`
}

const rect = (x, y, w, h, { r = 0, fill = 'none', stroke, sw = 1, cls } = {}) => {
  const a = [`x="${n(x)}"`, `y="${n(y)}"`, `width="${n(w)}"`, `height="${n(h)}"`]
  if (r) a.push(`rx="${n(r)}"`)
  a.push(`fill="${fill}"`)
  if (stroke) a.push(`stroke="${stroke}"`, `stroke-width="${n(sw)}"`)
  if (cls) a.push(`class="${cls}"`)
  return `<rect ${a.join(' ')}/>`
}

const hline = (x1, x2, y, stroke = C.lineSoft) =>
  `<line x1="${n(x1)}" y1="${n(y) + 0.5}" x2="${n(x2)}" y2="${n(y) + 0.5}" stroke="${stroke}" stroke-width="1"/>`

const PULSE = `
@keyframes p{0%,100%{opacity:1}50%{opacity:.45}}
.pulse{animation:p 3.2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.pulse{animation:none}}`

function icon (slug, x, y, size, fill) {
  const d = ICONS[slug]
  if (!d) throw new Error(`unknown brand icon: ${slug}`)
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24, 5)})"><path d="${d}" fill="${fill}"/></g>`
}

/** The only two drawn marks in the file, both on a 24x24 grid. */
const MARK = {
  arrow: 'M7.6 16.4 L16.4 7.6 M9.4 7.6 H16.4 V14.6',
  envelope: 'M3.6 6.4 H20.4 V17.6 H3.6 Z M3.6 6.9 L12 13.4 L20.4 6.9',
}
const mark = (d, x, y, size, stroke, sw = 1.7) =>
  `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24, 5)})">` +
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round"/></g>`

const doc = (w, h, body, style = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" fill="none" role="img">\n` +
  (style ? `<style>${style}</style>\n` : '') + body + '\n</svg>\n'

const written = []
const emit = (name, svg) => { writeFileSync(join(OUT, name), svg, 'utf8'); written.push([name, svg.length]) }
let warnings = 0
const warn = m => { warnings++; console.warn(`  ! ${m}`) }

/* ══════════════════════════════════════════════════════════════════
   CONTENT
   ══════════════════════════════════════════════════════════════════ */

const NAME = 'LE PHI ANH'
const ROLES_WIDE = 'Full-Stack Engineer   ·   Blockchain Engineer   ·   AI Engineer'
const ROLES_NARROW = 'Full-Stack · Blockchain · AI Engineer'
const CITY = 'HO CHI MINH CITY, VIETNAM'
const STATUS = 'OPEN TO OPPORTUNITIES'
const EMAIL = 'lephianh2006ht@gmail.com'
const AVAILABILITY = 'Available for full-time roles, freelance projects and collaboration.'

const PROSE = [
  'Engineer across the full stack, on-chain systems and applied AI.',
  'I build products end to end — from data model and smart contract to the interface people actually touch.',
]

const STACK = [
  ['FRONTEND', ['TypeScript', 'React', 'Next.js', 'Tailwind CSS', 'shadcn/ui']],
  ['BACKEND', ['Node.js', 'NestJS', 'Express', 'Gin', 'FastAPI']],
  ['DATA', ['PostgreSQL', 'MySQL', 'MariaDB', 'MongoDB', 'SQLite']],
  ['INFRA', ['Linux', 'Docker', 'Nginx', 'AWS', 'Vercel']],
  ['TOOLS', ['Git', 'Postman', 'Jira']],
]

/** `lead: true` marks the single row that earns the accent. */
const AWARDS = [
  { year: '2025', result: 'CHAMPION', event: 'Mammothon — Celestia Hackathon Vietnam', lead: true },
  { year: '2025', result: '3RD PLACE', event: 'Fintech Blockchain Hackathon' },
  { year: '2025', result: "PEOPLE'S CHOICE", event: 'AI Innovation Challenge' },
  { year: '2025', result: 'TOP 20 FINALIST', event: 'Artificial Intelligence Olympiad · OAI Ho Chi Minh City' },
  { year: '2025', result: 'SEMIFINALIST', event: 'Vietnam Blockchain Talent Search · VietChain Talents' },
  { year: '2025', result: 'CONSOLATION', event: 'Hackathon Pione Dream' },
]
const ALSO = ['GDG on Campus Hackathon Vietnam', 'AI+ Unlimited Future', 'K-Tech AI Hackathon']

/** Derived, so they can never drift from the table above. */
const FIGURES = [
  [String(AWARDS.filter(a => a.lead).length), 'CHAMPIONSHIP'],
  [String(AWARDS.length), 'PLACEMENTS'],
  [String(AWARDS.length + ALSO.length), 'COMPETITIONS ENTERED'],
]

const SOCIALS = [
  ['telegram', 'Telegram'], ['x', 'X'], ['tiktok', 'TikTok'],
  ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['reddit', 'Reddit'],
]

/* ══════════════════════════════════════════════════════════════════
   LAYOUTS
   ══════════════════════════════════════════════════════════════════ */

const LAYOUTS = [
  {
    key: 'wide', W: 900, PADX: 34, suffix: '', stacked: false,
    s: {
      name: 34, roles: 13, meta: 10.5, prose: 14, sec: 11, cat: 10.5, item: 13.5,
      fig: 46, figLabel: 10.5, year: 11, result: 11, event: 14, eventLead: 15,
      also: 12, body: 13.5,
    },
  },
  {
    key: 'narrow', W: 380, PADX: 20, suffix: '-narrow', stacked: true,
    s: {
      name: 25, roles: 12, meta: 11, prose: 13, sec: 11, cat: 11, item: 12.5,
      fig: 30, figLabel: 11, year: 11, result: 11, event: 12.5, eventLead: 13.5,
      also: 12, body: 12.5,
    },
  },
]

/* shared fragments, parameterised by layout ------------------------- */

const plate = (L, h, fill = C.plate) => rect(0.5, 0.5, L.W - 1, h - 1, { r: R, fill, stroke: C.line })

const sectionHead = (L, label, baseline) =>
  txt(label, { x: L.PADX, y: baseline, size: L.s.sec, fill: C.mid, weight: 700, tracking: 3.6 }) +
  hline(L.PADX, L.W - L.PADX, baseline + 12, C.line)

const statusMark = (L, x, cy, size = L.s.meta) =>
  `<circle cx="${n(x + 4)}" cy="${n(cy)}" r="4" fill="${C.accent}" class="pulse"/>` +
  txt(STATUS, { x: x + 18, y: cy + size * 0.35, size, fill: C.accent, weight: 700, tracking: 2.2 })

const statusW = (L, size = L.s.meta) => 18 + textW(STATUS, size, { bold: true, tracking: 2.2 })

/* ══════════════════════════════════════════════════════════════════
   MASTHEAD
   ══════════════════════════════════════════════════════════════════ */

function buildMasthead (L) {
  const { W, PADX, s } = L
  const right = W - PADX
  const inner = W - PADX * 2
  const parts = []
  let y

  if (!L.stacked) {
    parts.push(rect(PADX, 30, 44, 2, { fill: C.accent }))
    parts.push(
      txt(NAME, { x: PADX, y: 76, size: s.name, fill: C.hi, weight: 700, tracking: 1.6 }),
      txt(ROLES_WIDE, { x: PADX, y: 100, size: s.roles, fill: C.mid, weight: 500, tracking: 0.3 }),
      txt(CITY, { x: right, y: 70, size: s.meta, fill: C.low, weight: 600, tracking: 2.2, anchor: 'end' }),
      statusMark(L, right - statusW(L), 96),
      hline(PADX, right, 126, C.line),
    )
    y = 158
    const nameEnd = PADX + textW(NAME, s.name, { bold: true, tracking: 1.6 })
    const cityStart = right - textW(CITY, s.meta, { bold: true, tracking: 2.2 })
    if (nameEnd > cityStart - 24) warn(`${L.key} masthead row 1 collides by ${n(nameEnd - cityStart + 24)}px`)
    const rolesEnd = PADX + textW(ROLES_WIDE, s.roles)
    if (rolesEnd > right - statusW(L) - 24) warn(`${L.key} masthead row 2 collides by ${n(rolesEnd - (right - statusW(L)) + 24)}px`)
  } else {
    parts.push(rect(PADX, 22, 36, 2, { fill: C.accent }))
    parts.push(
      txt(NAME, { x: PADX, y: 62, size: s.name, fill: C.hi, weight: 700, tracking: 1.2 }),
      txt(ROLES_NARROW, { x: PADX, y: 84, size: s.roles, fill: C.mid, weight: 500 }),
      statusMark(L, PADX, 110),
      txt(CITY, { x: PADX, y: 132, size: s.meta, fill: C.low, weight: 600, tracking: 1.8 }),
      hline(PADX, right, 150, C.line),
    )
    y = 176
  }

  // Prose wraps to the sheet, so the measure stays readable at either width.
  for (let i = 0; i < PROSE.length; i++) {
    const size = i === 0 ? s.prose : s.body
    const fill = i === 0 ? C.hi : C.mid
    const weight = i === 0 ? 600 : 400
    for (const line of wrap(PROSE[i], inner, size, { bold: weight >= 600 })) {
      parts.push(txt(line, { x: PADX, y, size, fill, weight }))
      y += size + 7.5
    }
    y += 3
  }

  const H = Math.round(y + 12)
  emit(`masthead${L.suffix}.svg`, doc(W, H, [plate(L, H), ...parts].join('\n'), PULSE))
}

/* ══════════════════════════════════════════════════════════════════
   STACK
   ══════════════════════════════════════════════════════════════════ */

function buildStack (L) {
  const { W, PADX, s } = L
  const right = W - PADX
  const parts = [sectionHead(L, 'S T A C K', 40)]
  let y

  if (!L.stacked) {
    const itemsX = PADX + 108
    const colW = (right - itemsX) / 5
    const rowH = 40
    const top = 64
    STACK.forEach(([label, items], ri) => {
      const rTop = top + ri * rowH
      const base = rTop + 25
      if (ri > 0) parts.push(hline(PADX, right, rTop, C.lineSoft))
      parts.push(txt(label, { x: PADX, y: base, size: s.cat, fill: C.dim, weight: 700, tracking: 2.2 }))
      items.forEach((item, ci) => {
        parts.push(txt(item, { x: itemsX + ci * colW, y: base, size: s.item, fill: C.text, weight: 500 }))
        const w = textW(item, s.item)
        if (w > colW - 12) warn(`stack item "${item}" is ${n(w)}px inside a ${n(colW)}px column`)
      })
    })
    y = top + STACK.length * rowH + 20
  } else {
    y = 78
    STACK.forEach(([label, items], ri) => {
      if (ri > 0) { parts.push(hline(PADX, right, y - 20, C.lineSoft)) }
      parts.push(txt(label, { x: PADX, y, size: s.cat, fill: C.dim, weight: 700, tracking: 2.2 }))
      y += 19
      for (const line of wrap(items.join('  ·  '), W - PADX * 2, s.item)) {
        parts.push(txt(line, { x: PADX, y, size: s.item, fill: C.text, weight: 500 }))
        y += s.item + 6
      }
      y += 15
    })
    y += 2
  }

  const H = Math.round(y)
  emit(`stack${L.suffix}.svg`, doc(W, H, [plate(L, H), ...parts].join('\n')))
}

/* ══════════════════════════════════════════════════════════════════
   AWARDS — key figures for scale contrast, then a table grouped by year
   ══════════════════════════════════════════════════════════════════ */

function buildAwards (L) {
  const { W, PADX, s } = L
  const right = W - PADX
  const parts = [sectionHead(L, 'A W A R D S', 40)]

  /* key figures — the page's one moment of large type */
  let y
  if (!L.stacked) {
    const colW = (right - PADX) / FIGURES.length
    FIGURES.forEach(([value, label], i) => {
      const x = PADX + i * colW
      parts.push(
        txt(value, { x, y: 118, size: s.fig, fill: C.accent, weight: 700 }),
        txt(label, { x, y: 140, size: s.figLabel, fill: C.low, weight: 700, tracking: 2.2 }),
      )
      const lw = textW(label, s.figLabel, { bold: true, tracking: 2.2 })
      if (lw > colW - 16) warn(`figure label "${label}" is ${n(lw)}px in a ${n(colW)}px column`)
    })
    parts.push(hline(PADX, right, 162, C.line))
    y = 186
  } else {
    const colW = (right - PADX) / FIGURES.length
    FIGURES.forEach(([value, label], i) => {
      const x = PADX + i * colW
      parts.push(txt(value, { x, y: 100, size: s.fig, fill: C.accent, weight: 700 }))
      // Tighter tracking than the wide sheet: at 380px the columns are only
      // ~113px and "CHAMPIONSHIP" does not fit at the wide sheet's 2.2.
      const short = label.split(' ')[0]
      parts.push(txt(short, { x, y: 117, size: s.figLabel, fill: C.low, weight: 700, tracking: 0.8 }))
      const lw = textW(short, s.figLabel, { bold: true, tracking: 0.8 })
      if (lw > colW - 8) warn(`narrow figure label "${short}" is ${n(lw)}px in a ${n(colW)}px column`)
    })
    parts.push(hline(PADX, right, 136, C.line))
    y = 158
  }

  /* table, grouped by year so an identical year is printed once, not per row */
  const years = [...new Set(AWARDS.map(a => a.year))]
  for (const year of years) {
    parts.push(txt(year, { x: PADX, y, size: s.year, fill: C.low, weight: 700, tracking: 1.6 }))
    // Clear the year baseline before the first row: a lead row paints a tinted
    // block starting 20px (wide) / 15px (narrow) above its own baseline, which
    // at a 14px step used to sit on top of this label and clip it.
    y += L.stacked ? 26 : 30

    for (const a of AWARDS.filter(x => x.year === year)) {
      if (!L.stacked) {
        const rowH = 32
        if (a.lead) parts.push(rect(PADX - 10, y - 20, right - PADX + 20, rowH, { r: 4, fill: C.lead }))
        const eventX = PADX + 168
        parts.push(
          txt(a.result, { x: PADX, y, size: s.result, fill: a.lead ? C.accent : C.mid, weight: 700, tracking: 1.5 }),
          txt(a.event, { x: eventX, y, size: a.lead ? s.eventLead : s.event, fill: a.lead ? C.hi : C.text, weight: a.lead ? 600 : 500 }),
        )
        const rw = PADX + textW(a.result, s.result, { bold: true, tracking: 1.5 })
        if (rw > eventX - 14) warn(`award result "${a.result}" overruns its column by ${n(rw - eventX + 14)}px`)
        const ew = eventX + textW(a.event, a.lead ? s.eventLead : s.event, { bold: a.lead })
        if (ew > right) warn(`award event "${a.event}" overflows by ${n(ew - right)}px`)
        y += rowH
      } else {
        const lines = wrap(a.event, W - PADX * 2, a.lead ? s.eventLead : s.event, { bold: a.lead })
        const blockH = 18 + lines.length * (s.event + 5) + 11
        if (a.lead) parts.push(rect(PADX - 8, y - 15, right - PADX + 16, blockH, { r: 4, fill: C.lead }))
        parts.push(txt(a.result, { x: PADX, y, size: s.result, fill: a.lead ? C.accent : C.mid, weight: 700, tracking: 1.5 }))
        y += 18
        for (const line of lines) {
          parts.push(txt(line, { x: PADX, y, size: a.lead ? s.eventLead : s.event, fill: a.lead ? C.hi : C.text, weight: a.lead ? 600 : 500 }))
          y += s.event + 5
        }
        y += 11
      }
    }
  }

  /* also competed */
  y += L.stacked ? 2 : 6
  parts.push(hline(PADX, right, y - 14, C.line))
  y += 14
  parts.push(txt('ALSO COMPETED', { x: PADX, y, size: s.cat, fill: C.dim, weight: 700, tracking: 2.2 }))

  if (!L.stacked) {
    const alsoX = PADX + 148
    const alsoText = ALSO.join('   ·   ')
    parts.push(txt(alsoText, { x: alsoX, y, size: s.also, fill: C.low }))
    const labelEnd = PADX + textW('ALSO COMPETED', s.cat, { bold: true, tracking: 2.2 })
    if (labelEnd > alsoX - 20) warn(`"ALSO COMPETED" label crowds its list by ${n(labelEnd - alsoX + 20)}px`)
    const aw = alsoX + textW(alsoText, s.also)
    if (aw > right) warn(`"also competed" row overflows by ${n(aw - right)}px`)
    y += 22
  } else {
    y += 18
    for (const line of wrap(ALSO.join('  ·  '), W - PADX * 2, s.also)) {
      parts.push(txt(line, { x: PADX, y, size: s.also, fill: C.low }))
      y += s.also + 5
    }
    y += 6
  }

  const H = Math.round(y)
  emit(`awards${L.suffix}.svg`, doc(W, H, [plate(L, H), ...parts].join('\n')))
}

/* ══════════════════════════════════════════════════════════════════
   FOOTER — no longer repeats the masthead's status pill or city
   ══════════════════════════════════════════════════════════════════ */

function buildFooter (L) {
  const { W, PADX, s } = L
  const right = W - PADX
  const parts = []
  let H

  if (!L.stacked) {
    H = 86
    parts.push(
      txt(AVAILABILITY, { x: PADX, y: 51, size: s.body, fill: C.mid }),
      txt(EMAIL, { x: right, y: 51, size: s.body, fill: C.text, anchor: 'end' }),
    )
    const l = PADX + textW(AVAILABILITY, s.body)
    const r = right - textW(EMAIL, s.body)
    if (l > r - 24) warn(`footer columns collide by ${n(l - r + 24)}px`)
  } else {
    let y = 40
    for (const line of wrap(AVAILABILITY, W - PADX * 2, s.body)) {
      parts.push(txt(line, { x: PADX, y, size: s.body, fill: C.mid }))
      y += s.body + 6
    }
    y += 8
    parts.push(txt(EMAIL, { x: PADX, y, size: s.body, fill: C.text }))
    H = Math.round(y + 22)
  }

  emit(`footer${L.suffix}.svg`, doc(W, H, [plate(L, H), ...parts].join('\n')))
}

/* ══════════════════════════════════════════════════════════════════
   LINK BUTTONS — one size; they are already touch-sized on a phone and
   must not scale with the sheets, or they would shrink below 24px
   ══════════════════════════════════════════════════════════════════ */

const GUTTER = 4 // transparent margin; GitHub's own inter-image whitespace adds ~4px

function buildLabelButton (file, label, glyph) {
  const H = 38
  const size = 12.5
  const tw = textW(label, size, { bold: true, tracking: 0.3 })
  const inner = 15 + 15 + 9 + tw + 16
  const cy = H / 2
  const body = [
    rect(GUTTER + 0.5, 0.5, inner - 1, H - 1, { r: R, fill: C.plateAlt, stroke: C.line }),
    mark(glyph, GUTTER + 15, cy - 7.5, 15, C.mid),
    txt(label, { x: GUTTER + 15 + 15 + 9, y: cy + 4.4, size, fill: C.text, weight: 600, tracking: 0.3 }),
  ].join('')
  const w = Math.ceil(inner + GUTTER * 2)
  emit(file, doc(w, H, body))
  return { w, h: H }
}

function buildSocialButton (slug) {
  const S = 38
  const body = [
    rect(GUTTER + 0.5, 0.5, S - 1, S - 1, { r: R, fill: C.plateAlt, stroke: C.line }),
    icon(slug, GUTTER + (S - 15) / 2, (S - 15) / 2, 15, C.mid),
  ].join('')
  const w = S + GUTTER * 2
  emit(`soc-${slug}.svg`, doc(w, S, body))
  return { w, h: S }
}

/* ══════════════════════════════════════════════════════════════════
   RUN
   ══════════════════════════════════════════════════════════════════ */

// Narrow sheets stay unemitted — see the note at the top of this file. The
// layout code is kept because it is correct and ready the moment GitHub stops
// injecting an <a> inside <picture>, or the content moves to native markdown.
const EMIT_NARROW = false

for (const L of LAYOUTS) {
  if (L.stacked && !EMIT_NARROW) continue
  buildMasthead(L)
  buildStack(L)
  buildAwards(L)
  buildFooter(L)
}
const btn = {
  portfolio: buildLabelButton('btn-portfolio.svg', 'Portfolio', MARK.arrow),
  email: buildLabelButton('btn-email.svg', 'Email', MARK.envelope),
}
for (const [slug] of SOCIALS) btn[slug] = buildSocialButton(slug)

const total = written.reduce((a, [, b]) => a + b, 0)
console.log(`${written.length} assets → ${OUT}`)
for (const [name, size] of written) console.log(`  ${name.padEnd(22)} ${String(Math.round(size / 1024)).padStart(3)} KB`)
console.log(`  ${'total'.padEnd(22)} ${String(Math.round(total / 1024)).padStart(3)} KB`)
console.log(`\nlayout warnings: ${warnings}`)
console.log('button dimensions for README:')
for (const [k, v] of Object.entries(btn)) console.log(`  ${k.padEnd(11)} width="${v.w}" height="${v.h}"`)
