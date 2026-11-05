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

export function extractContour(
  { data, width, height },
  threshold = 128,
  invert = false,
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
  const points = [
    ...simplify(raw.slice(0, half + 1), 0.8).slice(0, -1),
    ...simplify([...raw.slice(half), raw[0]], 0.8).slice(0, -1),
  ];
  if (points.length < 3) throw new Error("The detected shape is too small.");
  if (points.length > 600)
    throw new Error(
      "The contour is too complex. Please use a simpler silhouette.",
    );
  if (signedArea(points) < 0) points.reverse();
  const warnings = [];
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
