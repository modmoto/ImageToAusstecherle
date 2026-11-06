import { planSupports } from "./supports.js";
import { scaleContour } from "./contour.js";

export const defaults = {
  size: 50,
  height: 15,
  wall: 1.5,
  taper: 10,
  tip: 0.1,
  base: 5,
  margin: 5,
};

export function validateParameters(p) {
  for (const key of Object.keys(defaults))
    if (!Number.isFinite(p[key]))
      throw new Error("Please enter valid dimensions.");
  if (p.size < 15 || p.size > 300)
    throw new Error("Contour width must be between 15 and 300 mm.");
  if (p.height < 2 || p.height > 50)
    throw new Error("Wall height must be between 2 and 50 mm.");
  if (p.wall < 0.4 || p.wall > 5)
    throw new Error("Wall thickness must be between 0.4 and 5 mm.");
  if (p.tip < 0.1 || p.tip > p.wall)
    throw new Error(
      "The cutting edge must be at least 0.1 mm and no thicker than the wall.",
    );
  if (p.taper < 0 || p.taper >= p.height)
    throw new Error("Taper start must be below the wall height.");
  if (p.base < 1 || p.base > 15 || p.margin < 0.5 || p.margin > 20)
    throw new Error("Base thickness: 1–15 mm; base margin: 0.5–20 mm.");
}

// A tapered rectangular segment. Round frustums at its endpoints join the
// segments into a constant-width stroke without scaling the entire silhouette.
function wedge(api, a, b, lower, upper, height) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy),
    nx = -dy / len,
    ny = dx / len;
  const vertices = [];
  for (const [r, z] of [
    [lower, 0],
    [upper, height],
  ]) {
    for (const [point, sign] of [
      [a, -1],
      [b, -1],
      [b, 1],
      [a, 1],
    ])
      vertices.push(point[0] + sign * nx * r, point[1] + sign * ny * r, z);
  }
  const faces = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2,
    3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ];
  return new api.Manifold(
    new api.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(vertices),
      triVerts: new Uint32Array(faces),
    }),
  );
}

function buildWall(api, inner, p, keep, isRim) {
  if (inner.isEmpty())
    throw new Error(
      "The wall is too thick for this shape. Increase the size or reduce wall thickness.",
    );
  const outer = keep(inner.offset(p.wall, "Round", 2, 32));
  const flange = isRim
    ? keep(inner.offset(p.wall + p.margin, "Round", 2, 32))
    : outer;
  const baseSection = keep(flange.subtract(inner));
  const parts = [];
  if (isRim) {
    parts.push(keep(baseSection.extrude(p.base)));
    if (p.taper > 0) {
      const wallSection = keep(outer.subtract(inner));
      const wall = keep(wallSection.extrude(p.taper));
      parts.push(keep(wall.translate([0, 0, p.base])));
    }
  }
  const taperHeight = p.height - p.taper;
  if (!isRim && p.wall === p.tip) {
    parts.push(keep(baseSection.extrude(p.base + p.height)));
    return { parts, baseSection, outer, flange };
  }
  const taperParts = [];
  const lowerWidth = isRim ? p.wall : Math.min(0.0001, p.wall - p.tip);
  const upperWidth = isRim ? p.tip : p.wall - p.tip;
  for (const boundary of inner.toPolygons()) {
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i];
      const b = boundary[(i + 1) % boundary.length];
      taperParts.push(
        keep(wedge(api, a, b, lowerWidth, upperWidth, taperHeight)),
      );
      const join = keep(
        api.Manifold.cylinder(taperHeight, lowerWidth, upperWidth, 32),
      );
      taperParts.push(keep(join.translate([a[0], a[1], 0])));
    }
  }
  // The bevel faces the dough discarded outside the cookie or inside each hole.
  const taperStroke = keep(api.Manifold.union(taperParts));
  const z = p.base + p.taper;
  if (isRim) {
    const opening = keep(inner.extrude(taperHeight));
    const taperedWall = keep(taperStroke.subtract(opening));
    parts.push(keep(taperedWall.translate([0, 0, z])));
  } else {
    const bevel = keep(taperStroke.translate([0, 0, z]));
    const outerSolid = keep(outer.extrude(p.base + p.height));
    const opening = keep(inner.extrude(p.base + p.height));
    const waste = keep(api.Manifold.union([opening, bevel]));
    parts.push(keep(outerSolid.subtract(waste)));
  }
  return { parts, baseSection, outer, flange };
}

export function createCutter(api, input, p, holes = []) {
  validateParameters(p);
  const owned = [];
  const keep = (value) => (owned.push(value), value);
  try {
    const points = scaleContour(input, p.size);
    const makeOpening = (ring) => {
      const section = keep(new api.CrossSection([ring]));
      return keep(section.offset(-p.wall / 2, "Round", 2, 32));
    };
    const inner = makeOpening(points);
    const rim = buildWall(api, inner, p, keep, true);
    const parts = rim.parts;
    let supports = [];
    if (holes.length) {
      if (holes.length > 8)
        throw new Error("Use at most eight internal cutouts.");
      const openings = holes.map((ring) =>
        makeOpening(scaleContour(ring, p.size, input)),
      );
      const inserts = openings.map((opening) =>
        buildWall(api, opening, p, keep, false),
      );
      const plan = planSupports(api, inner, rim, openings, inserts, p, keep);
      supports = plan.map(({ from, to, a, b, length }) => ({
        from,
        to,
        a,
        b,
        length,
      }));
      parts.push(...inserts.flatMap(({ parts }) => parts));
      parts.push(...plan.map(({ section }) => keep(section.extrude(p.base))));
    }
    const result = keep(api.Manifold.union(parts));
    if (
      result.status() !== "NoError" ||
      result.isEmpty() ||
      result.volume() <= 0
    )
      throw new Error("Could not create a closed solid for this contour.");
    const components = result.decompose();
    const connected = components.length === 1;
    components.forEach((item) => item.delete());
    if (!connected)
      throw new Error(
        "The solid is disconnected. Please adjust the dimensions or image.",
      );
    const mesh = result.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++)
      positions.set(
        mesh.vertProperties.subarray(i * mesh.numProp, i * mesh.numProp + 3),
        i * 3,
      );
    const bounds = result.boundingBox();
    return {
      positions,
      indices: new Uint32Array(mesh.triVerts),
      volume: result.volume(),
      bounds,
      triangles: mesh.numTri,
      contour: points,
      supports,
    };
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
  }
}
