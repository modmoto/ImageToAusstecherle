import { scaleContour } from "./contour.js";

export const defaults = {
  size: 80,
  height: 20,
  wall: 1.2,
  taper: 15,
  tip: 0.1,
  base: 5,
  margin: 5,
};

export function validateParameters(p) {
  for (const key of Object.keys(defaults))
    if (!Number.isFinite(p[key]))
      throw new Error("Bitte gültige Maße eingeben.");
  if (p.size < 15 || p.size > 300)
    throw new Error("Die Konturgröße muss zwischen 15 und 300 mm liegen.");
  if (p.height < 2 || p.height > 50)
    throw new Error("Die Wandhöhe muss zwischen 2 und 50 mm liegen.");
  if (p.wall < 0.4 || p.wall > 5)
    throw new Error("Die Wandstärke muss zwischen 0,4 und 5 mm liegen.");
  if (p.tip < 0.1 || p.tip > p.wall)
    throw new Error(
      "Die Schneidkante muss mindestens 0,1 mm und höchstens so dick wie die Wand sein.",
    );
  if (p.taper < 0 || p.taper >= p.height)
    throw new Error(
      "Der Beginn der Verjüngung muss unterhalb der Wandhöhe liegen.",
    );
  if (p.base < 1 || p.base > 15 || p.margin < 0.5 || p.margin > 20)
    throw new Error("Base: 1–15 mm Dicke, Randabstand: 0,5–20 mm.");
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

export function createCutter(api, input, p) {
  validateParameters(p);
  const owned = [];
  const keep = (value) => (owned.push(value), value);
  try {
    const points = scaleContour(input, p.size);
    const shape = keep(new api.CrossSection([points]));
    const outer = keep(shape.offset(p.wall / 2, "Round", 2, 32));
    const inner = keep(shape.offset(-p.wall / 2, "Round", 2, 32));
    if (inner.isEmpty())
      throw new Error(
        "Die Wand ist für diese Form zu dick. Größe erhöhen oder Wandstärke reduzieren.",
      );
    const flange = keep(shape.offset(p.wall / 2 + p.margin, "Round", 2, 32));
    const baseSection = keep(flange.subtract(inner));
    const base = keep(baseSection.extrude(p.base));
    const wallSection = keep(outer.subtract(inner));
    const parts = [base];
    if (p.taper > 0)
      parts.push(
        keep(keep(wallSection.extrude(p.taper)).translate([0, 0, p.base])),
      );
    const taperParts = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      taperParts.push(
        keep(wedge(api, a, b, p.wall / 2, p.tip / 2, p.height - p.taper)),
      );
      taperParts.push(
        keep(
          keep(
            api.Manifold.cylinder(
              p.height - p.taper,
              p.wall / 2,
              p.tip / 2,
              32,
            ),
          ).translate([a[0], a[1], 0]),
        ),
      );
    }
    parts.push(
      keep(
        keep(api.Manifold.union(taperParts)).translate([
          0,
          0,
          p.base + p.taper,
        ]),
      ),
    );
    const result = keep(api.Manifold.union(parts));
    if (
      result.status() !== "NoError" ||
      result.isEmpty() ||
      result.volume() <= 0
    )
      throw new Error(
        "Für diese Kontur konnte kein geschlossener Körper erzeugt werden.",
      );
    const components = result.decompose();
    const connected = components.length === 1;
    components.forEach((item) => item.delete());
    if (!connected)
      throw new Error(
        "Der Körper ist nicht zusammenhängend. Bitte Maße oder Bild anpassen.",
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
    };
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
  }
}
