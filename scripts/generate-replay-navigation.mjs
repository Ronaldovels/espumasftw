// Uses the PNG decoder installed with Next.js; no image processing runs in the browser.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));
const size = 256;
const maps = {};
const connections = JSON.parse(await readFile(new URL("../data/replay-navigation-links.json", import.meta.url), "utf8"));
const mapScales = JSON.parse(await readFile(new URL("../lib/tactics/maps.json", import.meta.url), "utf8"));
for (const file of (await readdir(new URL("../public/minimaps/", import.meta.url))).filter((name) => name.endsWith(".png")).sort()) {
  const source = await readFile(new URL(`../public/minimaps/${file}`, import.meta.url));
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const grid = new Uint8Array(size * size);
  const floor = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return false;
    const offset = (y * info.width + x) * 4;
    const low = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const high = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    // The map's grey/site floors are walkable. Dark voids, white wall/box
    // outlines and saturated teleporter artwork are not walking corridors.
    return data[offset + 3] > 100 && low > 55 && high < 190 && high - low < 75;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let clear = true;
    // Sample the entire cell, plus a pixel of clearance. A thin wall must not
    // disappear when the 1024px source is reduced to the navigation grid.
    for (let py = Math.floor(y * info.height / size) - 1; clear && py <= Math.ceil((y + 1) * info.height / size); py++) {
      for (let px = Math.floor(x * info.width / size) - 1; px <= Math.ceil((x + 1) * info.width / size); px++) {
        if (!floor(px, py)) { clear = false; break; }
      }
    }
    grid[y * size + x] = Number(clear);
  }
  // Small islands inside crate outlines/decoration are not connected floors.
  const seen = new Uint8Array(grid.length);
  let largest = [];
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || seen[start]) continue;
    const component = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const cell = component[cursor];
      const x = cell % size;
      for (const next of [x > 0 ? cell - 1 : -1, x < size - 1 ? cell + 1 : -1, cell - size, cell + size]) {
        if (next >= 0 && next < grid.length && grid[next] && !seen[next]) { seen[next] = 1; component.push(next); }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const walkable = new Uint8Array(grid.length);
  for (const cell of largest) walkable[cell] = 1;
  const rows = Array.from({ length: size }, (_, y) => {
    const spans = [];
    for (let x = 0; x < size; x++) if (walkable[y * size + x]) {
      const start = x;
      while (x + 1 < size && walkable[y * size + x + 1]) x++;
      spans.push(`${start}-${x}`);
    }
    return spans.join(",");
  });
  const mapId = file.slice(0, -4);
  const links = [];
  for (const connection of connections.maps[mapId] ?? []) {
    const width = Math.hypot(connection.entry[1][0] - connection.entry[0][0], connection.entry[1][1] - connection.entry[0][1]);
    const steps = Math.max(1, Math.ceil(width / connections.coordinateSize * size));
    const cellAt = (band, progress) => {
      const x = Math.floor((band[0][0] + (band[1][0] - band[0][0]) * progress) / connections.coordinateSize * size);
      const y = Math.floor((band[0][1] + (band[1][1] - band[0][1]) * progress) / connections.coordinateSize * size);
      return y * size + x;
    };
    for (let step = 0; step <= steps; step++) {
      const from = cellAt(connection.entry, step / steps), to = cellAt(connection.exit, step / steps);
      if (!walkable[from] || !walkable[to]) throw new Error(`${mapId} ${connection.id}: link must connect two walking floors`);
      links.push({ id: connection.id, kind: connection.kind, from, to });
    }
  }
  maps[mapId] = { sha256: createHash("sha256").update(source).digest("hex"), metersToMapUnits: mapScales[mapId].meter, rows, ...(links.length ? { links } : {}) };
  console.log(`${file}: ${largest.length} connected walking cells`);
}
const output = `${JSON.stringify({ size, maps }, null, 2)}\n`;
const destination = new URL("../data/replay-navigation.json", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")).replace(/\r\n/g, "\n") !== output) throw new Error("Replay navigation is out of date; run npm run replay:navigation");
} else await writeFile(destination, output);
