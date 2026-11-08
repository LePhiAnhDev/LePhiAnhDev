#!/usr/bin/env node
// Builds the profile's generated assets. No dependencies; Node 20+.
//
//   node scripts/build-profile.mjs assets          header, typing line, footer, tech-stack grid and about card -> assets/
//   node scripts/build-profile.mjs streak <file>   streak card snapshot (used by the daily workflow)
//   node scripts/build-profile.mjs plate <file>    paint the palette's plate behind an SVG (the snake)
//
// Everything reads profile.config.json. Assets are snapshots: the README never
// calls capsule-render, readme-typing-svg or skillicons at view time, so an
// outage on their side cannot break the page. A fetch that fails or returns an
// error card leaves the previous file in place.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(ROOT, "profile.config.json"), "utf8"));
const P = config.palette;

// Services answer 200 with an error drawn into the SVG, so the status code alone proves nothing.
const ERROR_MARKERS = [/something went wrong/i, /rate.?limit/i, /DEPLOYMENT_[A-Z_]+/, /could not (?:fetch|resolve)/i, /user not found/i];

async function fetchSvg(url, { attempts = 3, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "profile-asset-builder" } });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!/<svg[\s>]/.test(body.slice(0, 600))) throw new Error("response is not an SVG");
      const marker = ERROR_MARKERS.find((re) => re.test(body));
      if (marker) throw new Error(`error card returned (${marker})`);
      return body;
    } catch (err) {
      lastError = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`${url}\n  ${lastError.message}`);
}

async function write(rel, content) {
  const file = join(ROOT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content.trim() + "\n");
  console.log(`wrote ${rel}`);
}

const q = (params) => new URLSearchParams(params).toString().replace(/\+/g, "%20");

// --- header / typing / footer ------------------------------------------------

function headerUrl() {
  const h = config.header;
  return "https://capsule-render.vercel.app/api?" + q({
    type: "waving", height: h.height,
    color: `0:${P.bg},50:${P.blue},100:${P.purple}`,
    text: h.text, fontColor: P.text, fontSize: 64, fontAlignY: 36,
    desc: h.desc, descAlignY: 56, descSize: 18, animation: "fadeIn",
  });
}

function footerUrl() {
  return "https://capsule-render.vercel.app/api?" + q({
    type: "waving", section: "footer", height: config.footer.height,
    color: `0:${P.purple},50:${P.blue},100:${P.bg}`,
  });
}

function typingUrl() {
  return "https://readme-typing-svg.demolab.com?" + q({
    font: "JetBrains Mono", weight: 600, size: 22, pause: 1000,
    color: P.purpleOnLight, center: "true", vCenter: "true", width: 560, height: 50,
    lines: config.typing.lines.join(";"),
  });
}

// capsule-render draws its waves as two translucent layers (opacity 0.4). On
// GitHub's dark page that reads as a deep gradient; on the light page it washes
// out and the name disappears. Opaque copies of both waves, in GitHub's dark
// page colour and on the same animation, go underneath, so the banner looks the
// same on either theme. The text's CSS fade-in is dropped as well: the name must
// never depend on an animation running to become visible.
function solidifyCapsule(svg) {
  const waves = svg.match(/<path d="" fill="url\(#linear\)" opacity="[\d.]+"\s*>[\s\S]*?<\/path>/g);
  if (!waves || waves.length === 0) throw new Error("capsule-render layout changed: no wave layers found");
  const bases = waves.map((w) => w.replace(/fill="url\(#linear\)" opacity="[\d.]+"/, 'fill="#0D1117" opacity="1"'));
  return svg
    .replace(waves[0], bases.join("\n") + "\n" + waves[0])
    .replace(/\.text, \.desc \{\s*animation:[^}]*\}\s*@keyframes fadeIn \{[\s\S]*?\}\s*\}/, "");
}

// --- tech stack strips --------------------------------------------------------

// skillicons draws each icon as a 256-unit tile and steps 300 units per icon.
const TILE = 256, STEP = 300, ICON_PX = 48;

async function skillicon(id) {
  const svg = await fetchSvg(`https://skillicons.dev/icons?i=${id}`);
  // The response wraps the tile in an outer 48px <svg>; an unknown id comes back as the empty wrapper.
  const start = svg.indexOf("<svg", svg.indexOf("<svg") + 4);
  const end = svg.indexOf("</svg>", start);
  if (start < 0 || end < 0) throw new Error(`skillicons has no icon "${id}"`);
  const body = svg.slice(svg.indexOf(">", start) + 1, end);
  return `<svg width="256" height="256" viewBox="0 0 256 256" fill="none">${body}</svg>`;
}

async function customIcon(spec) {
  const src = await fetchSvg(`https://cdn.jsdelivr.net/npm/simple-icons@${config.stack.simpleIconsVersion}/icons/${spec.slug}.svg`);
  const d = src.match(/<path d="([^"]+)"/)?.[1];
  if (!d) throw new Error(`simple-icons has no path for "${spec.slug}"`);
  // 24-unit glyph scaled to 160 and centred, matching skillicons' glyph area.
  return `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="256" height="256" rx="60" fill="#${spec.tile}"/>` +
    `<path transform="translate(48 48) scale(6.6667)" d="${d}" fill="#${spec.glyph}"/></svg>`;
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// Inlined icons share one document, so their gradient and clip ids must not collide.
function scopeIds(svg, key) {
  return svg
    .replace(/id="([^"]+)"/g, `id="${key}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${key}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${key}-$1"`);
}

// One grid of icons, `perline` per row; a short last row is centred.
async function stackGrid() {
  const { icons, perline, names, custom } = config.stack;
  const cols = Math.min(perline, icons.length);
  const rows = Math.ceil(icons.length / cols);
  const tiles = [];
  for (const [i, id] of icons.entries()) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? icons.length - row * cols : cols;
    const offset = ((cols - inRow) * STEP) / 2;
    const raw = custom[id] ? await customIcon(custom[id]) : await skillicon(id);
    const placed = raw.replace(/^<svg /, `<svg x="${offset + (i % cols) * STEP}" y="${row * STEP}" `);
    tiles.push(`<g><title>${xml(names[id] ?? id)}</title>${scopeIds(placed, id)}</g>`);
  }
  const vbW = cols * STEP - (STEP - TILE);
  const vbH = rows * STEP - (STEP - TILE);
  const label = xml(`Tech stack: ${icons.map((id) => names[id] ?? id).join(", ")}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round((vbW * ICON_PX) / TILE)}" height="${Math.round((vbH * ICON_PX) / TILE)}" viewBox="0 0 ${vbW} ${vbH}" fill="none" role="img" aria-label="${label}">
<title>${label}</title>
${tiles.join("\n")}
</svg>`;
}

// --- about card -----------------------------------------------------------------
//
// A terminal window: the command is typed, then the logo and each row appear in
// turn, and a cursor blinks on a fresh prompt. Every animation runs from the
// element's own visible state, so a viewer that ignores SMIL still shows the
// whole card. JetBrains Mono is embedded as a subset of exactly the characters
// used, because an <img> SVG cannot load web fonts and the columns and logo
// only line up in a monospace face with known metrics.

const TOKYO = {
  bg: `#${P.bg}`, line: `#${P.line}`, fg: `#${P.text}`, muted: "#565F89",
  blue: `#${P.blue}`, purple: `#${P.purple}`, green: `#${P.green}`,
  dots: ["#F7768E", "#E0AF68", "#9ECE6A"],
  swatches: ["#F7768E", "#FF9E64", "#E0AF68", "#9ECE6A", "#73DACA", "#7DCFFF", "#7AA2F7", "#BB9AF7"],
};

async function embeddedMono(text) {
  const chars = [...new Set(text)].sort().join("");
  // Google Fonts serves woff2 only to browser user agents.
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&text=${encodeURIComponent(chars)}`, { headers: { "user-agent": ua } })).text();
  const faces = [...css.matchAll(/font-weight: (\d+);\s*src: url\(([^)]+)\)/g)];
  if (faces.length === 0) throw new Error("Google Fonts returned no JetBrains Mono faces");
  let out = "";
  for (const [, weight, url] of faces) {
    const res = await fetch(url, { headers: { "user-agent": ua } });
    if (!res.ok) throw new Error(`font download failed: HTTP ${res.status}`);
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    out += `@font-face{font-family:'JBM';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }
  return out;
}

function wrap(text, max) {
  const lines = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (cur && (cur + " " + word).length > max) { lines.push(cur); cur = word; }
    else cur = cur ? cur + " " + word : word;
  }
  return cur ? [...lines, cur] : lines;
}

function aboutCard({ narrow, font }) {
  const A = config.about;
  const C = TOKYO;
  const fs = narrow ? 13.5 : 15;            // font size
  const cw = fs * 0.6;                      // JetBrains Mono advance is 600/1000 em
  const lh = narrow ? 21 : 23;              // row height
  const pad = narrow ? 18 : 28;
  const W = narrow ? 380 : 840;
  const bar = 34;                           // title bar
  const logoW = narrow ? 0 : A.logo[0].length * cw + 44;
  const infoX = pad + logoW;
  const keyCols = Math.max(...A.rows.map((r) => r.key.length)) + 2;
  const valX = infoX + keyCols * cw;
  const maxChars = Math.floor((W - pad - valX) / cw);

  const lines = []; // { key?, text, color }
  for (const r of A.rows) {
    wrap(r.value, maxChars).forEach((text, i) => lines.push({ key: i === 0 ? r.key : null, text, color: C[r.color] ?? C.fg }));
  }

  const promptY = bar + 30;
  const top = promptY + lh + 10;
  const bodyRows = 2 + lines.length + 2;    // name, rule, rows, gap, swatches
  const finalY = top + bodyRows * lh + 4;
  const H = finalY + 22;

  const who = `${A.user}@${A.host}`;
  const prompt = (y) => `<text x="${pad}" y="${y}"><tspan fill="${C.green}">${xml(who)}</tspan><tspan fill="${C.blue}"> ~</tspan><tspan fill="${C.fg}"> $ </tspan></text>`;
  const cmdX = pad + (who.length + 5) * cw;

  // Timeline, in seconds.
  const typeStart = 0.4, perChar = 0.07;
  const typeEnd = typeStart + A.command.length * perChar;
  const outStart = typeEnd + 0.35, step = 0.05;
  const appear = (t) => `<animate attributeName="opacity" values="0;1" keyTimes="0;1" calcMode="discrete" dur="${t.toFixed(3)}s" fill="freeze"/>`;

  const body = [];
  if (!narrow) {
    const ah = fs * 1.32;                   // block glyphs fill ascent + descent, so rows touch
    const logoTop = top + (bodyRows * lh - A.logo.length * ah) / 2 + fs * 0.6;
    A.logo.forEach((row, i) => body.push(`<g>${appear(outStart + step * i)}<text x="${pad}" y="${(logoTop + i * ah).toFixed(1)}" fill="${i < A.logo.length / 2 ? C.blue : C.purple}">${xml(row)}</text></g>`));
  }
  let k = 0;
  const at = () => outStart + step * k++;
  let y = top;
  body.push(`<g>${appear(at())}<text x="${infoX}" y="${y}" font-weight="700"><tspan fill="${C.blue}">${xml(A.user)}</tspan><tspan fill="${C.fg}">@</tspan><tspan fill="${C.purple}">${xml(A.host)}</tspan></text></g>`);
  y += lh;
  body.push(`<g>${appear(at())}<text x="${infoX}" y="${y}" fill="${C.muted}">${"─".repeat(who.length)}</text></g>`);
  for (const l of lines) {
    y += lh;
    const key = l.key ? `<text x="${infoX}" y="${y}" fill="${C.blue}" font-weight="700">${xml(l.key)}</text>` : "";
    body.push(`<g>${appear(at())}${key}<text x="${valX}" y="${y}" fill="${l.color}">${xml(l.text)}</text></g>`);
  }
  y += lh * 2 - 14;
  const sw = narrow ? 22 : 26, gap = narrow ? 4 : 4;
  body.push(`<g>${appear(at())}${C.swatches.map((c, i) => `<rect x="${infoX + i * (sw + gap)}" y="${y}" width="${sw}" height="14" rx="3" fill="${c}"/>`).join("")}</g>`);
  const done = at() + 0.15;

  const widths = Array.from({ length: A.command.length + 1 }, (_, i) => (i * cw).toFixed(1));
  const typeDur = typeEnd + 0.001;
  const keyTimes = widths.map((_, i) => ((typeStart + i * perChar) / typeDur).toFixed(4));
  const summary = A.rows.map((r) => `${r.key}: ${r.value}`).join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(summary)}">
<title>${xml(summary)}</title>
<style>${font}text{font-family:'JBM','JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:${fs}px;white-space:pre}</style>
<defs><clipPath id="about-cmd"><rect x="${cmdX}" y="${promptY - fs}" width="${widths.at(-1)}" height="${fs + 6}"><animate attributeName="width" values="0;${widths.join(";")}" keyTimes="0;${keyTimes.join(";")}" dur="${typeDur.toFixed(3)}s" calcMode="discrete" fill="freeze"/></rect></clipPath></defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${C.bg}" stroke="${C.line}"/>
<path d="M0.5 ${bar}H${W - 0.5}" stroke="${C.line}"/>
${C.dots.map((c, i) => `<circle cx="${pad - 6 + i * 20}" cy="${bar / 2}" r="6" fill="${c}"/>`).join("")}
<text x="${W / 2}" y="${bar / 2 + 4.5}" text-anchor="middle" fill="${C.muted}" style="font-size:${narrow ? 11.5 : 12.5}px">${xml(who)}: ~</text>
${prompt(promptY)}
<text x="${cmdX}" y="${promptY}" fill="${C.fg}" clip-path="url(#about-cmd)">${xml(A.command)}</text>
${body.join("\n")}
<g>${appear(done)}${prompt(finalY)}<rect x="${cmdX}" y="${finalY - fs + 2}" width="${cw}" height="${fs + 2}" fill="${C.fg}"><animate attributeName="opacity" values="1;1;0;0" dur="1.1s" begin="${done.toFixed(2)}s" repeatCount="indefinite"/></rect></g>
</svg>`;
}

async function buildAbout() {
  const A = config.about;
  const text = [A.user, A.host, A.command, "@~$:─ ", ...A.logo, ...A.rows.flatMap((r) => [r.key, r.value])].join("");
  const font = await embeddedMono(text);
  await write("assets/about.svg", aboutCard({ narrow: false, font }));
  await write("assets/about-narrow.svg", aboutCard({ narrow: true, font }));
}

// --- commands -------------------------------------------------------------------

async function buildAssets() {
  await write("assets/header.svg", solidifyCapsule(await fetchSvg(headerUrl())));
  await write("assets/typing.svg", await fetchSvg(typingUrl()));
  await write("assets/footer.svg", solidifyCapsule(await fetchSvg(footerUrl())));
  await write("assets/stack.svg", await stackGrid());
  await buildAbout();
}

async function buildStreak(out) {
  const url = "https://streak-stats.demolab.com?" + q({
    user: config.username, theme: "tokyonight",
    background: P.bg, border: P.line, stroke: P.line, hide_border: "false",
  });
  try {
    const svg = await fetchSvg(url);
    if (!/Current Streak/i.test(svg)) throw new Error("card has no streak figures");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, svg);
    console.log(`wrote ${out}`);
  } catch (err) {
    // Keep yesterday's card rather than publishing a broken one. The workflow
    // step is continue-on-error, so a non-zero exit only flags the run.
    console.log(`::warning::streak card not refreshed, keeping the previous one. ${err.message}`);
    process.exitCode = 1;
  }
}

async function plate(file) {
  const svg = await readFile(file, "utf8");
  const vb = svg.match(/viewBox=["']([-\d.\s]+)["']/)?.[1].trim().split(/\s+/).map(Number);
  if (!vb || vb.length !== 4) throw new Error(`${file}: no viewBox to size the plate from`);
  const [x, y, w, h] = vb;
  const rx = Math.round(h * 0.04);
  const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#${P.bg}" stroke="#${P.line}"/>`;
  await writeFile(file, svg.replace(/(<svg\b[^>]*>)/, `$1${rect}`));
  console.log(`plated ${file}`);
}

const [cmd, arg] = process.argv.slice(2);
const commands = { assets: () => buildAssets(), streak: () => buildStreak(arg), plate: () => plate(arg) };
if (!commands[cmd] || (cmd !== "assets" && !arg)) {
  console.error("usage: build-profile.mjs assets | streak <file> | plate <file>");
  process.exit(2);
}
await commands[cmd]();
