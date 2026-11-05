import { contours } from "d3-contour";

export function signedArea(points) {
  return (
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2
  );
}

// Ramer–Douglas–Peucker, split at the opposite vertex to simplify a closed ring.
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const a = points[0],
    b = points.at(-1);
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  let max = tolerance * tolerance,
    index = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const t = length
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
        )
      : 0;
    const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  return index < 0
    ? [a, b]
    : [
        ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(index), tolerance),
      ];
}

export const defaultDetail = 3;
const detailTolerances = [2, 1.25, 0.8, 0.5, 0.25];

export function extractContour(
  { data, width, height },
  threshold = 128,
  invert = false,
  detail = defaultDetail,
) {
  // Composite over white: transparent pixels are background, not black ink.
  const values = new Uint8Array(width * height);
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const alpha = data[i * 4 + 3] / 255;
    const gray =
      (0.2126 * data[i * 4] +
        0.7152 * data[i * 4 + 1] +
        0.0722 * data[i * 4 + 2]) *
        alpha +
      255 * (1 - alpha);
    values[i] = invert
      ? +(alpha > 0 && gray >= threshold)
      : +(gray < threshold);
    count += values[i];
  }
  if (!count)
    throw new Error(
      "No shape detected. Adjust the threshold or invert the image.",
    );
  if (count > values.length * 0.98)
    throw new Error(
      "Almost the entire image is filled. Check the background or invert the image.",
    );
  const polygons = contours().size([width, height]).thresholds([0.5])(values)[0]
    .coordinates;
  const sorted = polygons.sort(
    (a, b) => Math.abs(signedArea(b[0])) - Math.abs(signedArea(a[0])),
  );
  if (!sorted.length) throw new Error("No closed contour found.");
  const raw = sorted[0][0].slice(0, -1).map(([x, y]) => [x, height - y]);
  const half = Math.floor(raw.length / 2);
  const tolerance =
    detailTolerances[detail - 1] ?? detailTolerances[defaultDetail - 1];
  const firstHalf = raw.slice(0, half + 1);
  const secondHalf = [...raw.slice(half), raw[0]];
  const simplifyRing = (epsilon) => [
    ...simplify(firstHalf, epsilon).slice(0, -1),
    ...simplify(secondHalf, epsilon).slice(0, -1),
  ];

  let points = simplifyRing(tolerance);
  const warnings = [];
  const pointLimit = 600;
  if (points.length > pointLimit) {
    let lower = tolerance;
    let upper = tolerance * 2;
    points = simplifyRing(upper);
    while (points.length > pointLimit) {
      lower = upper;
      upper *= 2;
      points = simplifyRing(upper);
    }
    // Find a tolerance near the limit without discarding more detail than needed.
    for (let i = 0; i < 10; i++) {
      const middle = (lower + upper) / 2;
      const candidate = simplifyRing(middle);
      if (candidate.length > pointLimit) {
        lower = middle;
      } else {
        upper = middle;
        points = candidate;
      }
    }
    warnings.push("Contour detail was reduced to keep conversion manageable.");
  }
  if (points.length < 3) throw new Error("The detected shape is too small.");
  if (signedArea(points) < 0) points.reverse();
  if (sorted.length > 1)
    warnings.push("Multiple shapes detected: only the largest is used.");
  if (sorted[0].length > 1)
    warnings.push(
      "Internal image contours are ignored; the cutter remains open inside.",
    );
  return { points, warnings };
}

export function scaleContour(points, size) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = size / (maxX - minX);
  return points.map(([x, y]) => [
    (x - (minX + maxX) / 2) * scale,
    (y - (minY + maxY) / 2) * scale,
  ]);
}

export function contourAspect(points) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return (
    (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))
  );
}
