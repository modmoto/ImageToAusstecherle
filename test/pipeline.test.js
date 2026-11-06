import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import Module from "manifold-3d";
import {
  extractContour,
  scaleContour,
  contourAspect,
  signedArea,
} from "../src/contour.js";
import { createCutter, defaults } from "../src/geometry.js";
import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const api = await Module();
api.setup();
for (const name of ["herz", "stern", "quadrat", "schlange"])
  test(`${name}: real PNG → connected closed mesh → binary STL`, () => {
    const png = PNG.sync.read(
      readFileSync(new URL(`../examples/${name}.png`, import.meta.url)),
    );
    const { points } = extractContour(png);
    const result = createCutter(api, points, defaults);
    assert.ok(result.volume > 0);
    assert.ok(Math.abs(result.bounds.max[2] - 20) < 0.001);
    // Every edge has exactly two opposing directed uses.
    const edges = new Map();
    const idx = result.indices;
    for (let i = 0; i < idx.length; i += 3)
      for (let j = 0; j < 3; j++) {
        const a = idx[i + j],
          b = idx[i + ((j + 1) % 3)],
          key = a < b ? `${a},${b}` : `${b},${a}`;
        const entry = edges.get(key) || { count: 0, balance: 0 };
        entry.count++;
        entry.balance += a < b ? 1 : -1;
        edges.set(key, entry);
      }
    for (const edge of edges.values()) {
      assert.equal(edge.count, 2);
      assert.equal(edge.balance, 0);
    }
    const body = new api.Manifold(
      new api.Mesh({
        numProp: 3,
        vertProperties: result.positions,
        triVerts: idx,
      }),
    );
    assert.equal(body.status(), "NoError");
    assert.equal(body.genus(), 1, "single through opening");
    const pieces = body.decompose();
    assert.equal(pieces.length, 1);
    pieces.forEach((p) => p.delete());
    body.delete();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(result.positions, 3),
    );
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const binary = new STLExporter().parse(new THREE.Mesh(geo), {
      binary: true,
    });
    assert.equal(binary.byteLength, 84 + result.triangles * 50);
    const restored = new STLLoader().parse(binary.buffer);
    restored.computeBoundingBox();
    assert.ok(Math.abs(restored.boundingBox.max.z - 20) < 0.001);
    assert.ok(restored.attributes.position.count > 0);
    console.log(
      `${name}: ${points.length} contour vertices, ${result.triangles} triangles, ${(binary.byteLength / 1024).toFixed(0)} KB STL`,
    );
    geo.dispose();
    restored.dispose();
  });
test("empty image and invalid parameters fail clearly", () => {
  assert.throws(
    () =>
      extractContour({ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) }),
    /No shape/,
  );
  assert.throws(
    () =>
      createCutter(
        api,
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        { ...defaults, tip: 2 },
      ),
    /cutting edge/,
  );
  assert.throws(
    () =>
      createCutter(
        api,
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        { ...defaults, taper: 20 },
      ),
    /Taper start/,
  );
});
test("parameter changes affect dimensions and wall sections", () => {
  const points = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const p = {
    ...defaults,
    size: 100,
    base: 3,
    margin: 7,
    height: 18,
    wall: 2,
    tip: 0.6,
    taper: 12,
  };
  const r = createCutter(api, points, p);
  assert.ok(Math.abs(r.bounds.max[0] - r.bounds.min[0] - 116) < 0.01);
  assert.ok(Math.abs(r.bounds.max[2] - 21) < 0.001);
  const body = new api.Manifold(
    new api.Mesh({
      numProp: 3,
      vertProperties: r.positions,
      triVerts: r.indices,
    }),
  );
  const mid = body.slice(3 + 6),
    tip = body.slice(21 - 0.001);
  assert.ok(mid.area() > tip.area() * 2);
  const openingArea = (section) =>
    Math.min(
      ...section.toPolygons().map((polygon) => Math.abs(signedArea(polygon))),
    );
  assert.ok(Math.abs(openingArea(mid) - 98 ** 2) < 0.01);
  assert.ok(Math.abs(openingArea(tip) - openingArea(mid)) < 0.01);
  assert.equal(body.genus(), 1);
  mid.delete();
  tip.delete();
  body.delete();
});

test("width is horizontal, including tall images; X and Y stay proportional", () => {
  const points = [
    [0, 0],
    [20, 0],
    [20, 80],
    [0, 80],
  ];
  assert.equal(contourAspect(points), 4);
  const scaled = scaleContour(points, 50);
  const xs = scaled.map((p) => p[0]),
    ys = scaled.map((p) => p[1]);
  assert.equal(Math.max(...xs) - Math.min(...xs), 50);
  assert.equal(Math.max(...ys) - Math.min(...ys), 200);
  const body = createCutter(api, points, defaults);
  assert.ok(Math.abs(body.bounds.max[0] - body.bounds.min[0] - 61.5) < 0.01);
  assert.ok(Math.abs(body.bounds.max[1] - body.bounds.min[1] - 211.5) < 0.01);
});

test("contour detail preserves more points at higher settings", () => {
  const png = PNG.sync.read(
    readFileSync(new URL("../examples/herz.png", import.meta.url)),
  );
  const counts = [1, 3, 5].map(
    (detail) => extractContour(png, 128, false, detail).points.length,
  );
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2], counts.join(", "));
});

test("dense contours at maximum detail are simplified to the point limit", () => {
  const width = 508,
    height = 120;
  const data = new Uint8Array(width * height * 4);
  for (let x = 2; x < width - 2; x++) {
    const inset = x % 2 === 0 ? 5 : 10;
    for (let y = inset; y < height - inset; y++) {
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  const { points, warnings } = extractContour(
    { data, width, height },
    128,
    false,
    5,
  );
  assert.ok(points.length >= 3 && points.length <= 600);
  assert.ok(warnings.some((message) => message.includes("detail was reduced")));
});

test("smiley cutouts share three base-level supports sized by the base settings", () => {
  const png = PNG.sync.read(
    readFileSync(new URL("../examples/smiley.png", import.meta.url)),
  );
  const { points, holes } = extractContour(png);
  assert.equal(holes.length, 4);

  for (const dimensions of [defaults, { ...defaults, base: 3, margin: 2 }]) {
    const result = createCutter(api, points, dimensions, holes);
    for (let insert = 1; insert <= holes.length; insert++) {
      assert.equal(
        result.supports.filter(
          ({ from, to }) => from === insert || to === insert,
        ).length,
        3,
      );
    }
    assert.ok(result.supports.some(({ from }) => from !== 0));

    const body = new api.Manifold(
      new api.Mesh({
        numProp: 3,
        vertProperties: result.positions,
        triVerts: result.indices,
      }),
    );
    const ringAreas = (z) => {
      const slice = body.slice(z);
      const rings = slice.decompose();
      const areas = rings
        .map((ring) =>
          ring
            .toPolygons()
            .map((polygon) => Math.abs(signedArea(polygon)))
            .sort((a, b) => b - a),
        )
        .sort((a, b) => b[0] - a[0]);
      rings.forEach((ring) => ring.delete());
      slice.delete();
      return areas;
    };
    const straight = ringAreas(dimensions.base + dimensions.taper - 0.5);
    const tapered = ringAreas(dimensions.base + dimensions.height - 0.5);
    assert.equal(straight.length, 5);
    assert.equal(tapered.length, 5);
    assert.ok(tapered[0][0] < straight[0][0]);
    assert.ok(Math.abs(tapered[0][1] - straight[0][1]) < 0.01);
    for (let i = 1; i < straight.length; i++) {
      assert.ok(Math.abs(tapered[i][0] - straight[i][0]) < 0.01);
      assert.ok(tapered[i][1] > straight[i][1]);
    }

    const { a, b, length } = result.supports.reduce((longest, support) =>
      support.length > longest.length ? support : longest,
    );
    const x = (b[0] - a[0]) / length;
    const y = (b[1] - a[1]) / length;
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const probe = new api.CrossSection([
      [
        [-0.05, -dimensions.margin],
        [0.05, -dimensions.margin],
        [0.05, dimensions.margin],
        [-0.05, dimensions.margin],
      ].map(([u, v]) => [cx + x * u - y * v, cy + y * u + x * v]),
    ]);
    for (const [z, expected] of [
      [dimensions.base - 0.01, dimensions.margin * 0.1],
      [dimensions.base + 0.01, 0],
    ]) {
      const slice = body.slice(z);
      const intersection = slice.intersect(probe);
      assert.ok(Math.abs(intersection.area() - expected) < 0.001);
      intersection.delete();
      slice.delete();
    }
    probe.delete();
    body.delete();
  }
});
