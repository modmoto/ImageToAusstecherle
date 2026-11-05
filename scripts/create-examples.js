import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

const size = 512;
const shapes = {
  herz: Array.from({ length: 240 }, (_, i) => {
    const t = (i / 240) * Math.PI * 2;
    return [
      256 + 12 * 16 * Math.sin(t) ** 3,
      260 -
        12 *
          (13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t)),
    ];
  }),
  stern: Array.from({ length: 10 }, (_, i) => {
    const t = (i * Math.PI) / 5 - Math.PI / 2,
      r = i % 2 ? 90 : 205;
    return [256 + r * Math.cos(t), 256 + r * Math.sin(t)];
  }),
  quadrat: [
    [76, 76],
    [436, 76],
    [436, 436],
    [76, 436],
  ],
};
function inside(x, y, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
const snake = Array.from({ length: 240 }, (_, i) => {
  const x = 64 + (i / 239) * 384;
  return [x, 256 + 110 * Math.sin((i / 239) * Math.PI * 2)];
});
mkdirSync(new URL("../examples/", import.meta.url), { recursive: true });
for (const name of [...Object.keys(shapes), "schlange"]) {
  const svgShape =
    name === "schlange"
      ? `<polyline points="${snake.map((p) => p.join(",")).join(" ")}" fill="none" stroke="black" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<polygon points="${shapes[name].map((p) => p.join(",")).join(" ")}" fill="black"/>`;
  writeFileSync(
    new URL(`../examples/${name}.svg`, import.meta.url),
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${svgShape}</svg>\n`,
  );
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (const dx of [0.25, 0.75])
        for (const dy of [0.25, 0.75]) {
          const hit =
            name === "schlange"
              ? snake.some(
                  (p) => (x + dx - p[0]) ** 2 + (y + dy - p[1]) ** 2 <= 29 ** 2,
                )
              : inside(x + dx, y + dy, shapes[name]);
          hits += hit ? 1 : 0;
        }
      const index = (y * size + x) * 4;
      png.data[index] = png.data[index + 1] = png.data[index + 2] = 0;
      png.data[index + 3] = Math.round((hits / 4) * 255);
    }
  writeFileSync(
    new URL(`../examples/${name}.png`, import.meta.url),
    PNG.sync.write(png),
  );
}
console.log("Vier transparente PNG- und SVG-Beispiele erstellt (512 × 512).");
