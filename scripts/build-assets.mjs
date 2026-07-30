#!/usr/bin/env node
/**
 * build-assets.mjs — generates every SVG in ../assets that README.md renders.
 *
 *   node scripts/build-assets.mjs
 *
 * Zero dependencies. Edit the data blocks below and re-run; never hand-patch SVG.
 *
 * DESIGN RULES — restraint is the brief, so these are hard limits, not taste:
 *
 *   - No gradients, no glows, no blur, no texture, no shadows. Flat fills and
 *     1px hairlines only. Depth comes from value, not from effects.
 *   - One accent colour, in exactly two semantic roles: the availability marker
 *     and the Champion row. A third use would be decoration; keep it neutral.
 *   - Nothing is drawn that does not carry information. No corner ticks, no
 *     index numerals, no rank glyphs, no oversized ghost years.
 *   - Alignment does the work a gradient used to. The stack sits on a five
 *     column grid and the awards table on three, both computed here so the
 *     columns line up exactly all the way down the page.
 *
 * PLATFORM CONSTRAINTS — GitHub serves these from raw.githubusercontent.com
 * under `default-src 'none'; style-src 'unsafe-inline'; sandbox`:
 *
 *   1. No external font can load. Text renders in whatever the viewer has, so
 *      every string is anchored and every box is sized from the DejaVu Sans
 *      metric table below — the widest realistic fallback, so boxes keep slack
 *      under Segoe UI or Helvetica instead of clipping.
 *   2. Animation is CSS, not SMIL, so prefers-reduced-motion applies. The one
 *      animation moves between two visible states: strip every <style> block
 *      and the static frame is still the finished design.
 *   3. Clicks inside an <img> do not navigate, so each link is its own file
 *      that README.md wraps in an <a>.
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
   TOKENS
   ══════════════════════════════════════════════════════════════════ */

const C = {
  plate: '#0F0F11',
  plateAlt: '#141417',
  line: '#26262A',
  lineSoft: '#1C1C1F',
  hi: '#F2F2F3',
  text: '#C9C9CF',
  mid: '#A5A5AC',
  low: '#74747C',
  dim: '#54545C',
  accent: '#C8A063',
}

const SANS = "'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif"

const W = 900 // design width; GitHub's profile column is ~870px, so this eases down
const PADX = 34 // plate gutter, shared by every section so columns align page-wide
const R = 6 // plate corner radius — document, not app card

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
const BOLD_FACTOR = 1.06

/** Visible ink width. `tracking` is per-gap, so n-1 of them. */
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
 * SVG letter-spacing also adds a gap after the final glyph, so the advance the
 * anchor centres on is wider than the visible ink. Shift by half a gap (middle)
 * or a full gap (end) to land the *ink* where the caller asked.
 */
function txt (s, {
  x, y, size = 13, fill = C.mid, weight = 400, tracking = 0, anchor = 'start', cls,
}) {
  let ax = x
  if (tracking) {
    if (anchor === 'middle') ax += tracking / 2
    else if (anchor === 'end') ax += tracking
  }
  const a = [
    `x="${n(ax)}"`, `y="${n(y)}"`,
    `font-family="${SANS}"`, `font-size="${n(size)}"`, `fill="${fill}"`,
  ]
  if (weight !== 400) a.push(`font-weight="${weight}"`)
  if (tracking) a.push(`letter-spacing="${n(tracking)}"`)
  if (anchor !== 'start') a.push(`text-anchor="${anchor}"`)
  if (cls) a.push(`class="${cls}"`)
  return `<text ${a.join(' ')}>${esc(s)}</text>`
}

const rect = (x, y, w, h, { r = 0, fill = 'none', stroke, sw = 1 } = {}) => {
  const a = [`x="${n(x)}"`, `y="${n(y)}"`, `width="${n(w)}"`, `height="${n(h)}"`]
  if (r) a.push(`rx="${n(r)}"`)
  a.push(`fill="${fill}"`)
  if (stroke) a.push(`stroke="${stroke}"`, `stroke-width="${n(sw)}"`)
  return `<rect ${a.join(' ')}/>`
}

/** Hairline on a half-pixel so it stays 1px crisp instead of smearing. */
const hline = (x1, x2, y, stroke = C.lineSoft) =>
  `<line x1="${n(x1)}" y1="${n(y) + 0.5}" x2="${n(x2)}" y2="${n(y) + 0.5}" stroke="${stroke}" stroke-width="1"/>`

/** Plate: flat fill, 1px border drawn inside the box so nothing clips. */
const plate = (h, fill = C.plate) =>
  rect(0.5, 0.5, W - 1, h - 1, { r: R, fill, stroke: C.line })

/**
 * Section label with a full-width rule beneath it, and an optional right-hand
 * meta figure. The meta is there to quantify the section at a glance, so only
 * pass one when the number actually tells the reader something.
 */
const sectionHead = (label, baseline, meta) =>
  txt(label, { x: PADX, y: baseline, size: 10.5, fill: C.mid, weight: 700, tracking: 3.6 }) +
  (meta ? txt(meta, { x: W - PADX, y: baseline, size: 9.5, fill: C.dim, weight: 700, tracking: 2.2, anchor: 'end' }) : '') +
  hline(PADX, W - PADX, baseline + 12, C.line)

/**
 * Availability marker. The dot's own opacity is 1, so with animation disabled
 * it is simply a solid dot — the still frame is complete.
 */
const statusMark = (x, cy, label, size = 10, tracking = 2.2) =>
  `<circle cx="${n(x + 4)}" cy="${n(cy)}" r="4" fill="${C.accent}" class="pulse"/>` +
  txt(label, { x: x + 18, y: cy + size * 0.35, size, fill: C.accent, weight: 700, tracking })

const statusW = (label, size = 10, tracking = 2.2) =>
  18 + textW(label, size, { bold: true, tracking })

const PULSE = `
@keyframes p{0%,100%{opacity:1}50%{opacity:.45}}
.pulse{animation:p 3.2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.pulse{animation:none}}`

function icon (slug, x, y, size, fill) {
  const d = ICONS[slug]
  if (!d) throw new Error(`unknown brand icon: ${slug}`)
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24, 5)})"><path d="${d}" fill="${fill}"/></g>`
}

/** The only two drawn marks in the whole file, both on a 24x24 grid. */
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
const ROLES = 'Full-Stack Engineer   ·   Blockchain Engineer   ·   AI Engineer'
const CITY = 'HO CHI MINH CITY, VIETNAM'
const STATUS = 'OPEN TO OPPORTUNITIES'
const EMAIL = 'lephianh2006ht@gmail.com'

const PROSE = [
  ['Engineer across the full stack, on-chain systems and applied AI.', 13.5, C.hi, 600],
  ['I build products end to end — from data model and smart contract to the interface people actually touch.', 13, C.mid, 400],
  ['One championship and five further placements across nine hackathons and olympiads.', 13, C.mid, 400],
]

const STACK = [
  ['FRONTEND', ['TypeScript', 'React', 'Next.js', 'Tailwind CSS', 'shadcn/ui']],
  ['BACKEND', ['Node.js', 'NestJS', 'Express', 'Gin', 'FastAPI']],
  ['DATA', ['PostgreSQL', 'MySQL', 'MariaDB', 'MongoDB', 'SQLite']],
  ['INFRA', ['Linux', 'Docker', 'Nginx', 'AWS', 'Vercel']],
  ['TOOLS', ['Git', 'Postman', 'Jira']],
]

/** `lead: true` marks the single row that earns the accent colour. */
const AWARDS = [
  { year: '2025', result: 'CHAMPION', event: 'Mammothon — Celestia Hackathon Vietnam', lead: true },
  { year: '2025', result: '3RD PLACE', event: 'Fintech Blockchain Hackathon' },
  { year: '2025', result: "PEOPLE'S CHOICE", event: 'AI Innovation Challenge' },
  { year: '2025', result: 'TOP 20 FINALIST', event: 'Artificial Intelligence Olympiad · OAI Ho Chi Minh City' },
  { year: '2025', result: 'SEMIFINALIST', event: 'Vietnam Blockchain Talent Search · VietChain Talents' },
  { year: '2025', result: 'CONSOLATION', event: 'Hackathon Pione Dream' },
]

const ALSO = ['GDG on Campus Hackathon Vietnam', 'AI+ Unlimited Future', 'K-Tech AI Hackathon']

const SOCIALS = ['telegram', 'x', 'tiktok', 'linkedin', 'github', 'reddit']

/* ══════════════════════════════════════════════════════════════════
   MASTHEAD — name, roles, location, status, then the positioning copy
   ══════════════════════════════════════════════════════════════════ */

function buildMasthead () {
  const H = 212
  const right = W - PADX
  const parts = [plate(H)]

  // Letterhead rule: the one graphic flourish anywhere on the page.
  parts.push(rect(PADX, 30, 44, 2, { fill: C.accent }))

  parts.push(
    txt(NAME, { x: PADX, y: 72, size: 30, fill: C.hi, weight: 700, tracking: 1.6 }),
    txt(ROLES, { x: PADX, y: 96, size: 12.5, fill: C.mid, weight: 500, tracking: 0.3 }),
    txt(CITY, { x: right, y: 68, size: 10, fill: C.low, weight: 600, tracking: 2.2, anchor: 'end' }),
    statusMark(right - statusW(STATUS), 92, STATUS),
    hline(PADX, right, 122, C.line),
  )

  let y = 152
  for (const [line, size, fill, weight] of PROSE) {
    parts.push(txt(line, { x: PADX, y, size, fill, weight }))
    const w = textW(line, size, { bold: weight >= 600 })
    if (PADX + w > right) warn(`masthead prose overflows by ${n(PADX + w - right)}px: "${line.slice(0, 42)}…"`)
    y += 22
  }

  // The two header columns must not collide even at the widest fallback font.
  const nameEnd = PADX + textW(NAME, 30, { bold: true, tracking: 1.6 })
  const cityStart = right - textW(CITY, 10, { bold: true, tracking: 2.2 })
  const statusStart = right - statusW(STATUS)
  const rolesEnd = PADX + textW(ROLES, 12.5)
  if (nameEnd > cityStart - 24) warn(`masthead row 1 collides by ${n(nameEnd - cityStart + 24)}px`)
  if (rolesEnd > statusStart - 24) warn(`masthead row 2 collides by ${n(rolesEnd - statusStart + 24)}px`)

  emit('masthead.svg', doc(W, H, parts.join('\n'), PULSE))
}

/* ══════════════════════════════════════════════════════════════════
   LINK BUTTONS — separate files so README.md can wrap each in an <a>
   ══════════════════════════════════════════════════════════════════ */

const GUTTER = 4 // transparent margin; GitHub's own inter-image whitespace adds ~4px

function buildLabelButton (file, label, glyph) {
  const H = 38
  const size = 12
  const tw = textW(label, size, { bold: true, tracking: 0.3 })
  const inner = 15 + 15 + 9 + tw + 16
  const cy = H / 2
  const body = [
    rect(GUTTER + 0.5, 0.5, inner - 1, H - 1, { r: R, fill: C.plateAlt, stroke: C.line }),
    mark(glyph, GUTTER + 15, cy - 7.5, 15, C.mid),
    txt(label, { x: GUTTER + 15 + 15 + 9, y: cy + 4.2, size, fill: C.text, weight: 600, tracking: 0.3 }),
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
   STACK — five fixed columns so every row aligns down the page
   ══════════════════════════════════════════════════════════════════ */

function buildStack () {
  const itemsX = PADX + 108
  const cols = 5
  const colW = (W - PADX - itemsX) / cols
  const rowH = 38
  const top = 64
  const H = top + STACK.length * rowH + 20

  const parts = [plate(H), sectionHead('S T A C K', 40)]

  STACK.forEach(([label, items], ri) => {
    const rTop = top + ri * rowH
    const base = rTop + 24
    if (ri > 0) parts.push(hline(PADX, W - PADX, rTop, C.lineSoft))
    parts.push(txt(label, { x: PADX, y: base, size: 9.5, fill: C.dim, weight: 700, tracking: 2.2 }))
    items.forEach((item, ci) => {
      parts.push(txt(item, { x: itemsX + ci * colW, y: base, size: 12.5, fill: C.text, weight: 500 }))
      const w = textW(item, 12.5)
      if (w > colW - 12) warn(`stack item "${item}" is ${n(w)}px inside a ${n(colW)}px column`)
    })
  })

  emit('stack.svg', doc(W, H, parts.join('\n')))
}

/* ══════════════════════════════════════════════════════════════════
   AWARDS — a real three-column table, year first
   ══════════════════════════════════════════════════════════════════ */

function buildAwards () {
  const resultX = PADX + 64
  const eventX = PADX + 210
  const right = W - PADX
  const rowH = 34
  const top = 64
  const tableEnd = top + AWARDS.length * rowH
  const H = tableEnd + 52

  const placements = AWARDS.length
  const total = placements + ALSO.length
  const parts = [
    plate(H),
    sectionHead('A W A R D S', 40, `${placements} PLACEMENTS FROM ${total} COMPETITIONS`),
  ]

  AWARDS.forEach((a, i) => {
    const rTop = top + i * rowH
    const base = rTop + 22
    if (i > 0) parts.push(hline(PADX, right, rTop, C.lineSoft))

    const eventSize = a.lead ? 14 : 13.5
    parts.push(
      txt(a.year, { x: PADX, y: base, size: 11.5, fill: a.lead ? C.accent : C.low, weight: 600, tracking: 0.6 }),
      txt(a.result, { x: resultX, y: base, size: 10.5, fill: a.lead ? C.accent : C.mid, weight: 700, tracking: 1.5 }),
      txt(a.event, { x: eventX, y: base, size: eventSize, fill: a.lead ? C.hi : C.text, weight: a.lead ? 600 : 500 }),
    )

    const rw = textW(a.result, 10.5, { bold: true, tracking: 1.5 })
    if (resultX + rw > eventX - 14) warn(`award result "${a.result}" overruns its column by ${n(resultX + rw - eventX + 14)}px`)
    const ew = textW(a.event, eventSize, { bold: a.lead })
    if (eventX + ew > right) warn(`award event "${a.event}" overflows by ${n(eventX + ew - right)}px`)
  })

  parts.push(hline(PADX, right, tableEnd + 4, C.line))

  // "ALSO COMPETED" is a wide label, so it needs a deeper indent than the stack
  // gutter or the label and the list read as one run of text.
  const alsoX = PADX + 138
  const alsoText = ALSO.join('   ·   ')
  parts.push(
    txt('ALSO COMPETED', { x: PADX, y: tableEnd + 34, size: 9.5, fill: C.dim, weight: 700, tracking: 2.2 }),
    txt(alsoText, { x: alsoX, y: tableEnd + 34, size: 11.5, fill: C.low }),
  )
  const labelEnd = PADX + textW('ALSO COMPETED', 9.5, { bold: true, tracking: 2.2 })
  if (labelEnd > alsoX - 20) warn(`"ALSO COMPETED" label crowds its list by ${n(labelEnd - alsoX + 20)}px`)
  const aw = alsoX + textW(alsoText, 11.5)
  if (aw > right) warn(`"also competed" row overflows by ${n(aw - right)}px`)

  emit('awards.svg', doc(W, H, parts.join('\n')))
}

/* ══════════════════════════════════════════════════════════════════
   FOOTER — mirrors the masthead's two-column split
   ══════════════════════════════════════════════════════════════════ */

function buildFooter () {
  const H = 104
  const right = W - PADX
  const body = [
    plate(H),
    statusMark(PADX, 44, STATUS),
    txt('Available for full-time roles, freelance projects and collaboration.',
      { x: PADX, y: 74, size: 12.5, fill: C.mid }),
    txt(CITY, { x: right, y: 47, size: 10, fill: C.low, weight: 600, tracking: 2.2, anchor: 'end' }),
    txt(EMAIL, { x: right, y: 74, size: 12, fill: C.text, anchor: 'end' }),
  ].join('\n')
  emit('footer.svg', doc(W, H, body, PULSE))
}

/* ══════════════════════════════════════════════════════════════════
   RUN
   ══════════════════════════════════════════════════════════════════ */

buildMasthead()
const btn = {
  portfolio: buildLabelButton('btn-portfolio.svg', 'Portfolio', MARK.arrow),
  email: buildLabelButton('btn-email.svg', 'Email', MARK.envelope),
}
for (const s of SOCIALS) btn[s] = buildSocialButton(s)
buildStack()
buildAwards()
buildFooter()

const total = written.reduce((a, [, b]) => a + b, 0)
console.log(`${written.length} assets → ${OUT}`)
for (const [name, size] of written) console.log(`  ${name.padEnd(20)} ${String(Math.round(size / 1024)).padStart(3)} KB`)
console.log(`  ${'total'.padEnd(20)} ${String(Math.round(total / 1024)).padStart(3)} KB`)
console.log(`\nlayout warnings: ${warnings}`)
console.log('img dimensions for README:')
for (const [k, v] of Object.entries(btn)) console.log(`  ${k.padEnd(11)} width="${v.w}" height="${v.h}"`)
