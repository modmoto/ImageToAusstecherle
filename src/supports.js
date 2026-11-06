// Even perimeter samples keep candidate generation bounded for dense contours.
function sampleBoundary(section) {
  return section.toPolygons().flatMap((ring) => {
    const lengths = ring.map(([x, y], i) => {
      const next = ring[(i + 1) % ring.length];
      return Math.hypot(next[0] - x, next[1] - y);
    });
    const perimeter = lengths.reduce((sum, length) => sum + length, 0);
    let segment = 0;
    let start = 0;
    return Array.from({ length: 20 }, (_, i) => {
      const distance = (i * perimeter) / 20;
      while (distance > start + lengths[segment]) start += lengths[segment++];
      const a = ring[segment];
      const b = ring[(segment + 1) % ring.length];
      const t = (distance - start) / lengths[segment];
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    });
  });
}

function overlap(a, b) {
  const intersection = a.intersect(b);
  try {
    return intersection.area() > 1e-5;
  } finally {
    intersection.delete();
  }
}

function rectangle(a, b, width, depth) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const x = (b[0] - a[0]) / length;
  const y = (b[1] - a[1]) / length;
  const w = width / 2;
  return [
    [a[0] - x * depth + y * w, a[1] - y * depth - x * w],
    [b[0] + x * depth + y * w, b[1] + y * depth - x * w],
    [b[0] + x * depth - y * w, b[1] + y * depth + x * w],
    [a[0] - x * depth - y * w, a[1] - y * depth + x * w],
  ];
}

export function planSupports(api, inner, rim, openings, inserts, p, keep) {
  for (const [i, { outer }] of inserts.entries()) {
    const inside = outer.intersect(inner);
    const fits = outer.area() - inside.area() < 1e-5;
    inside.delete();
    if (
      !fits ||
      inserts.slice(0, i).some((insert) => overlap(outer, insert.outer))
    ) {
      throw new Error(
        "Cutout walls overlap. Increase the cutter size or reduce Wall Thickness.",
      );
    }
  }
  const bases = [
    rim.baseSection,
    ...inserts.map(({ baseSection }) => baseSection),
  ];
  const samples = [inner, ...inserts.map(({ outer }) => outer)].map(
    sampleBoundary,
  );
  const candidates = [];
  for (let from = 0; from < bases.length; from++) {
    for (let to = from + 1; to < bases.length; to++) {
      const pairs = samples[from].flatMap((a) =>
        samples[to].map((b) => ({
          a,
          b,
          length: Math.hypot(b[0] - a[0], b[1] - a[1]),
        })),
      );
      pairs.sort((a, b) => a.length - b.length);
      let accepted = 0;
      for (const { a, b, length } of pairs) {
        if (length < 1e-4) continue;
        const section = new api.CrossSection([
          rectangle(a, b, p.margin, p.wall / 2),
        ]);
        const inside = section.intersect(rim.flange);
        const fits = section.area() - inside.area() < 1e-5;
        inside.delete();
        if (
          !fits ||
          openings.some((opening) => overlap(section, opening)) ||
          !overlap(section, bases[from]) ||
          !overlap(section, bases[to]) ||
          bases.some(
            (base, i) => i !== from && i !== to && overlap(section, base),
          )
        ) {
          section.delete();
          continue;
        }
        candidates.push({
          id: candidates.length,
          from,
          to,
          a,
          b,
          length,
          section: keep(section),
        });
        if (++accepted === 16) break;
      }
    }
  }

  const byNode = bases.map((_, node) =>
    candidates
      .filter(({ from, to }) => from === node || to === node)
      .sort((a, b) => a.length - b.length),
  );
  const degree = bases.map(() => 0);
  const selected = [];
  const collisions = new Map();
  let best;
  let bestLength = Infinity;
  let visits = 0;

  function collides(a, b) {
    const key = Math.min(a.id, b.id) * candidates.length + Math.max(a.id, b.id);
    if (!collisions.has(key))
      collisions.set(key, overlap(a.section, b.section));
    return collisions.get(key);
  }

  function search(node, start, length) {
    if (++visits > 100000) return;
    while (node < degree.length && degree[node] === 3) {
      node++;
      start = 0;
    }
    const missing = degree.slice(1).reduce((sum, count) => sum + 3 - count, 0);
    const lowerBound = selected.length + Math.ceil(missing / 2);
    if (
      best &&
      (lowerBound > best.length ||
        (lowerBound === best.length && length >= bestLength))
    )
      return;
    if (node === degree.length) {
      const reached = new Set([0]);
      for (let pass = 0; pass < bases.length; pass++) {
        for (const { from, to } of selected) {
          if (reached.has(from) || reached.has(to)) {
            reached.add(from);
            reached.add(to);
          }
        }
      }
      if (reached.size === bases.length) {
        best = [...selected];
        bestLength = length;
      }
      return;
    }
    for (let i = start; i < byNode[node].length; i++) {
      const edge = byNode[node][i];
      const other = edge.from === node ? edge.to : edge.from;
      if (
        degree[other] === 3 ||
        selected.some((used) => used === edge || collides(used, edge))
      )
        continue;
      degree[node]++;
      if (other) degree[other]++;
      selected.push(edge);
      search(node, i + 1, length + edge.length);
      selected.pop();
      if (other) degree[other]--;
      degree[node]--;
    }
  }

  search(1, 0, 0);
  if (!best)
    throw new Error(
      "Could not fit three supports per cutout. Increase the cutter size or reduce Base Margin.",
    );
  return best;
}
