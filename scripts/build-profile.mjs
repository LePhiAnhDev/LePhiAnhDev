#!/usr/bin/env node
// Builds the profile's generated assets. No dependencies; Node 20+.
//
//   node scripts/build-profile.mjs assets          header, typing line, footer and tech-stack strips -> assets/
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

async function stackStrip(group) {
  const { names, custom } = config.stack;
  const tiles = [];
  for (const [i, id] of group.icons.entries()) {
    const raw = custom[id] ? await customIcon(custom[id]) : await skillicon(id);
    const placed = raw.replace(/^<svg /, `<svg x="${i * STEP}" y="0" `);
    tiles.push(`<g><title>${xml(names[id] ?? id)}</title>${scopeIds(placed, `${group.id}-${id}`)}</g>`);
  }
  const vbW = group.icons.length * STEP - (STEP - TILE);
  const label = xml(`${group.label}: ${group.icons.map((id) => names[id] ?? id).join(", ")}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round((vbW * ICON_PX) / TILE)}" height="${ICON_PX}" viewBox="0 0 ${vbW} ${TILE}" fill="none" role="img" aria-label="${label}">
<title>${label}</title>
${tiles.join("\n")}
</svg>`;
}

// --- commands -------------------------------------------------------------------

async function buildAssets() {
  await write("assets/header.svg", solidifyCapsule(await fetchSvg(headerUrl())));
  await write("assets/typing.svg", await fetchSvg(typingUrl()));
  await write("assets/footer.svg", solidifyCapsule(await fetchSvg(footerUrl())));
  for (const group of config.stack.groups) await write(`assets/stack/${group.id}.svg`, await stackStrip(group));
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
