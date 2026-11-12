export function getBoxEdges(body, bottom = 0) {
  const x = body.width / 2;
  const y = body.depth / 2;
  const top = bottom + body.height;
  const edges = [];
  for (const [side, yy] of [["front", -y], ["back", y]]) {
    for (const [end, xx] of [["left", -x], ["right", x]]) {
      edges.push({
        id: `vertical-${side}-${end}`,
        label: `Senkrecht ${side === "front" ? "vorne" : "hinten"} ${end === "left" ? "links" : "rechts"}`,
        start: [xx, yy, bottom], end: [xx, yy, top], vertical: true
      });
    }
  }
  for (const [level, z] of [["bottom", bottom], ["top", top]]) {
    for (const [side, yy] of [["front", -y], ["back", y]]) {
      edges.push({
        id: `${level}-${side}`,
        label: `${level === "top" ? "Oben" : "Unten"} ${side === "front" ? "vorne" : "hinten"}`,
        start: [-x, yy, z], end: [x, yy, z], vertical: false
      });
    }
    for (const [side, xx] of [["left", -x], ["right", x]]) {
      edges.push({
        id: `${level}-${side}`,
        label: `${level === "top" ? "Oben" : "Unten"} ${side === "left" ? "links" : "rechts"}`,
        start: [xx, -y, z], end: [xx, y, z], vertical: false
      });
    }
  }
  return edges;
}

export function matchesBoxEdge(edge, first, last) {
  const same = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < 1e-5);
  return (same(edge.start, first) && same(edge.end, last)) || (same(edge.start, last) && same(edge.end, first));
}

export function getVerticalEdges(selection) {
  return selection.filter((id) => id.startsWith("vertical-"));
}

export function verticalRoundingFits(body, radius, selection) {
  const chosen = new Set(getVerticalEdges(selection));
  if (!chosen.size || radius === 0) return true;
  if (radius >= Math.min(body.width, body.depth)) return false;
  for (const side of ["front", "back"]) {
    if (chosen.has(`vertical-${side}-left`) && chosen.has(`vertical-${side}-right`)
      && radius * 2 > body.width + 1e-8) return false;
  }
  for (const side of ["left", "right"]) {
    if (chosen.has(`vertical-front-${side}`) && chosen.has(`vertical-back-${side}`)
      && radius * 2 > body.depth + 1e-8) return false;
  }
  return true;
}

export function roundedCutFits(body, cut, radius, selection) {
  const chosen = new Set(getVerticalEdges(selection));
  if (!radius || !chosen.size) return true;
  const rounded = (side, end) => chosen.has(`vertical-${side}-${end}`);
  const cutWidth = cut.type === "circle" ? cut.diameter : cut.width;
  if (cut.face !== "bottom") {
    const alongX = cut.face === "front" || cut.face === "back";
    const size = alongX ? body.width : body.depth;
    const low = alongX ? rounded(cut.face, "left") : rounded("front", cut.face);
    const high = alongX ? rounded(cut.face, "right") : rounded("back", cut.face);
    return cut.u - cutWidth / 2 >= -size / 2 + (low ? Math.max(radius, body.wall) : body.wall)
      && cut.u + cutWidth / 2 <= size / 2 - (high ? Math.max(radius, body.wall) : body.wall);
  }
  const innerRadius = Math.max(0, radius - body.wall);
  if (!innerRadius) return true;
  const cutHeight = cut.type === "circle" ? cut.diameter : cut.height;
  const halfWidth = body.width / 2 - body.wall;
  const halfDepth = body.depth / 2 - body.wall;
  for (const [side, sy] of [["front", -1], ["back", 1]]) {
    for (const [end, sx] of [["left", -1], ["right", 1]]) {
      if (!rounded(side, end)) continue;
      const dx = Math.max(0, sx * cut.u + cutWidth / 2 - (halfWidth - innerRadius));
      const dy = Math.max(0, sy * cut.v + cutHeight / 2 - (halfDepth - innerRadius));
      if (dx > 0 && dy > 0 && dx * dx + dy * dy > innerRadius * innerRadius) return false;
    }
  }
  return true;
}

export function getRoundedCellOutline(body, radius, selection, column, row) {
  const chosen = new Set(getVerticalEdges(selection));
  const r = Math.max(0, radius - body.wall);
  const halfWidth = body.width / 2 - body.wall;
  const halfDepth = body.depth / 2 - body.wall;
  let points = [];
  for (const [side, end, sx, sy, angle] of [
    ["front", "left", -1, -1, Math.PI],
    ["front", "right", 1, -1, -Math.PI / 2],
    ["back", "right", 1, 1, 0],
    ["back", "left", -1, 1, Math.PI / 2]
  ]) {
    if (!r || !chosen.has(`vertical-${side}-${end}`)) {
      points.push([sx * halfWidth, sy * halfDepth]);
      continue;
    }
    const cx = sx * (halfWidth - r);
    const cy = sy * (halfDepth - r);
    for (let i = 0; i <= 24; i += 1) {
      const a = angle + i * Math.PI / 48;
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  for (const [axis, limit, sign] of [[0, column.min, 1], [0, column.max, -1], [1, row.min, 1], [1, row.max, -1]]) {
    const input = points;
    points = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i += 1) {
      const previous = input[(i + input.length - 1) % input.length];
      const current = input[i];
      const previousInside = sign * (previous[axis] - limit) >= -1e-8;
      const currentInside = sign * (current[axis] - limit) >= -1e-8;
      if (previousInside !== currentInside) {
        const ratio = (limit - previous[axis]) / (current[axis] - previous[axis]);
        points.push(previous.map((value, j) => value + ratio * (current[j] - value)));
      }
      if (currentInside) points.push(current);
    }
  }
  return points;
}

export function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}
