const width = 3.8;
const slotWidth = 4.4;
const slotBelow = 22.5;
const slotAbove = 5;
const spineDepth = 2.2;
const clearance = 0.3;
const roundBoardOffset = 2.8;

export function getSkadisBoardOffset(body) {
  return body.shape === "roundContainer" ? roundBoardOffset : 0;
}

export function getInsertSpec(body, radius, x, z, boardThickness) {
  const r = body.width / 2;
  const edgeX = Math.abs(x) + slotWidth / 2;
  const bottom = z - (body.shape === "roundContainer" ? 3 : slotBelow);
  const top = z + slotAbove;
  const minBottom = body.shape === "roundContainer" ? body.base + 2 : 2;
  if (edgeX >= r - 1 || bottom < Math.max(minBottom, radius + 1)
    || top > body.height - radius - (body.shape === "roundContainer" ? 2 : 1)) return null;

  const verticalEdge = body.shape === "sphere" ? Math.max(Math.abs(bottom - 2 - r), Math.abs(top - r)) : 0;
  const square = r * r - edgeX * edgeX - verticalEdge * verticalEdge;
  if (square <= 0) return null;
  const outerMin = Math.sqrt(square);
  let startY;
  let undercut;
  if (body.shape === "roundContainer") {
    const flatRadius = r - radius;
    if (edgeX >= flatRadius) return null;
    const flatBottom = Math.sqrt(flatRadius * flatRadius - edgeX * edgeX);
    if (flatBottom < 8) return null;
    if (!Number.isFinite(body.wall) || !Number.isFinite(body.base) || body.wall <= 0) return null;
    const innerRadius = r - body.wall;
    if (edgeX >= innerRadius - 0.5) return null;
    const innerMin = Math.sqrt(innerRadius * innerRadius - edgeX * edgeX);
    if (innerMin <= 2.1) return null;
    startY = innerMin - 2.1;
    const slot = { x, y: (startY + r + 0.2) / 2, z: bottom, width: slotWidth, depth: r + 0.2 - startY, height: top - bottom };
    const supportStart = Math.max(0, flatBottom - 12);
    const supportEnd = r + roundBoardOffset - 0.15;
    const support = { x, y: (supportStart + supportEnd) / 2, z: -3, width,
      depth: supportEnd - supportStart, height: 2.9 };
    const reach = boardThickness + clearance;
    const boardFront = r + roundBoardOffset + 0.2;
    const pieces = [
      support,
      { x, y: r + 1.4, z: -3, width, depth: 2.5, height: top + 2.6 },
      { x, y: (r + 2.5 + boardFront + reach + 0.12) / 2, z: z - 1.5, width,
        depth: boardFront + reach + 0.12 - (r + 2.5), height: 3 },
      { x, y: boardFront + reach + 1.25, z: z - 7, width, depth: 2.5, height: 8.5 },
      { x, y: (startY + 0.1 + r + 0.3) / 2, z: top - 3.2, width, depth: r + 0.2 - startY, height: 2.8 },
      { x, y: startY + 1, z: top - 1.5, width, depth: 1.8, height: 3.2 }
    ];
    return { slot, support, undercut: undefined, pieces };
  } else {
    if (outerMin < 6) return null;
    startY = outerMin - 4;
    undercut = { x, y: startY + 1.1, z: bottom - 2, width: slotWidth, depth: 2.2, height: 5 };
  }
  const slot = { x, y: (startY + r + 0.2) / 2, z: bottom, width: slotWidth, depth: r + 0.2 - startY, height: top - bottom };
  const reach = boardThickness + clearance;
  const pieces = [
    { x, y: r - spineDepth / 2 + 0.1, z: bottom + 0.4, width, depth: spineDepth, height: z + 1.5 - bottom - 0.4 },
    { x, y: r + (reach + 0.12) / 2, z: z - 1.5, width, depth: reach + 0.12, height: 3 },
    { x, y: r + reach + 1.25, z: z - 7, width, depth: 2.5, height: 8.5 },
    { x, y: (startY + 0.1 + r + 0.1) / 2, z: bottom + 0.4, width, depth: r - startY, height: 2.8 },
    { x, y: startY + 1, z: bottom - 1.7, width, depth: 1.8, height: 3.2 }
  ];
  return { slot, undercut, pieces };
}
