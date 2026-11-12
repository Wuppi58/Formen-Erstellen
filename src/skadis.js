import { getInsertSpec } from "./skadis-inserts.js";

const hookWidth = 3.8;
const shelfHeight = 3;
const tailHeight = 5.5;
const tailDepth = 2.5;
const boardClearance = 0.3;
const overlap = 0.02;
const rootOverlap = 0.1;
const gridPitch = 40;
const singleLineLimit = 4;

export class SkadisCapacityError extends Error {
  constructor(message, suggestions) {
    super(message);
    this.suggestions = suggestions;
  }
}

function minimumDisplay(value) {
  return (Math.ceil((value - 1e-9) * 100) / 100).toFixed(2);
}

function gridCapacity(min, max) {
  return Math.max(0, Math.floor((max - min + 1e-9) / gridPitch) + 1);
}

function selectEvenly(values, count) {
  if (count === 1) {
    return [values[Math.floor((values.length - 1) / 2)]];
  }
  return Array.from({ length: count }, (_, index) => values[Math.round(index * (values.length - 1) / (count - 1))]);
}

function gridPositions(min, max, center, capacity, count) {
  if (count === 1) {
    return [Math.min(max, Math.max(min, center))];
  }
  const step = Math.floor((capacity - 1) / (count - 1)) * gridPitch;
  const span = (count - 1) * step;
  const start = Math.min(max - span, Math.max(min, center - span / 2));
  return Array.from({ length: count }, (_, index) => start + index * step);
}

function maximumGap(positions, min, max) {
  let gap = Math.max(positions[0] - min, max - positions[positions.length - 1]);
  for (let i = 1; i < positions.length; i += 1) {
    gap = Math.max(gap, (positions[i] - positions[i - 1]) / 2);
  }
  return gap;
}

function arrangeHooks(count, direction, bounds) {
  const { minX, maxX, minZ, maxZ, maxColumns, maxRows, height } = bounds;
  const rectangles = [];
  for (let columns = 2; columns <= maxColumns && columns <= count; columns += 1) {
    const rows = count / columns;
    if (Number.isInteger(rows) && rows >= 2 && rows <= maxRows) {
      rectangles.push({ columns, rows });
    }
  }
  let columns;
  let rows;
  if (count > singleLineLimit && rectangles.length) {
    for (const rectangle of rectangles) {
      const xs = gridPositions(minX, maxX, 0, maxColumns, rectangle.columns);
      const zs = gridPositions(minZ, maxZ, height / 2, maxRows, rectangle.rows);
      rectangle.gap = Math.max(maximumGap(xs, minX, maxX), maximumGap(zs, minZ, maxZ));
    }
    rectangles.sort((a, b) => a.gap - b.gap
      || (direction === "vertical" ? b.rows - a.rows : b.columns - a.columns));
    ({ columns, rows } = rectangles[0]);
  } else if (direction === "vertical") {
    const preferredRows = count > singleLineLimit && maxColumns > 1 ? Math.ceil(count / 2) : count;
    rows = Math.min(maxRows, Math.max(preferredRows, Math.ceil(count / maxColumns)));
    columns = Math.ceil(count / rows);
  } else {
    const preferredColumns = count > singleLineLimit && maxRows > 1 ? Math.ceil(count / 2) : count;
    columns = Math.min(maxColumns, Math.max(preferredColumns, Math.ceil(count / maxRows)));
    rows = Math.ceil(count / columns);
  }
  const xs = gridPositions(minX, maxX, 0, maxColumns, columns);
  const zs = gridPositions(minZ, maxZ, height / 2, maxRows, rows);
  const groups = direction === "vertical" ? xs : zs;
  const positions = [];
  groups.forEach((value, index) => {
    const groupCount = Math.floor(count / groups.length) + (index < count % groups.length ? 1 : 0);
    if (direction === "vertical") {
      selectEvenly(zs, groupCount).forEach((z) => positions.push({ x: value, z }));
    } else {
      selectEvenly(xs, groupCount).forEach((x) => positions.push({ x, z: value }));
    }
  });
  return { columns, rows, positions };
}

function hasCutConflict(positions, cuts) {
  return cuts.some((cut) => {
    if (cut.face !== "back") {
      return false;
    }
    const cutWidth = cut.type === "circle" ? cut.diameter : cut.width;
    const cutHeight = cut.type === "circle" ? cut.diameter : cut.height;
    return positions.some(({ x, z }) => Math.abs(cut.u - x) < (cutWidth + hookWidth) / 2
      && Math.abs(cut.v - z) < (cutHeight + shelfHeight) / 2);
  });
}

export function getSkadisGrid(body, radius, gridOffset = { x: 0, z: 0 }) {
  if (!["container", "box", "roundContainer", "cylinder", "sphere"].includes(body.shape)
    || !Number.isFinite(body.width) || !Number.isFinite(body.height)
    || body.width <= 0 || body.width > 1000 || body.height <= 0 || body.height > 1000
    || !Number.isFinite(radius) || radius < 0 || radius > 1000
    || !Number.isFinite(gridOffset.x) || !Number.isFinite(gridOffset.z)
    || Math.abs(gridOffset.x) > 1000 || Math.abs(gridOffset.z) > 1000) {
    return [];
  }
  const minX = -body.width / 2 + radius + hookWidth / 2;
  const maxX = -minX;
  const minZ = Math.max(radius + shelfHeight / 2, shelfHeight / 2 + tailHeight + 0.01);
  const maxZ = body.height - radius - shelfHeight / 2;
  const originZ = body.height / 2 - 20 + gridOffset.z;
  const positions = [];
  for (let column = Math.ceil((minX - gridOffset.x) / 20); column <= Math.floor((maxX - gridOffset.x) / 20); column += 1) {
    const offset = Math.abs(column % 2) * 20;
    const firstRow = Math.ceil((minZ - originZ - offset) / gridPitch);
    const lastRow = Math.floor((maxZ - originZ - offset) / gridPitch);
    for (let row = firstRow; row <= lastRow; row += 1) {
      const x = gridOffset.x + column * 20;
      const z = originZ + row * gridPitch + offset;
      if (body.shape === "container" || body.shape === "box" || getInsertSpec(body, radius, x, z, 5.5)) {
        positions.push({ column, row, x, z });
      }
    }
  }
  return positions;
}

function getManualPositions(body, radius, cuts, selection, gridOffset) {
  if (!Array.isArray(selection)) {
    throw new Error("Bitte gültige Hakenpositionen auswählen.");
  }
  if (!gridOffset || !Number.isFinite(gridOffset.x) || !Number.isFinite(gridOffset.z)
    || Math.abs(gridOffset.x) > 1000 || Math.abs(gridOffset.z) > 1000) {
    throw new Error("Die Rasterverschiebung muss zwischen −1.000 und 1.000 mm liegen.");
  }
  const grid = getSkadisGrid(body, radius, gridOffset);
  const positions = [];
  const used = new Set();
  for (const slot of selection) {
    if (!slot || !Number.isInteger(slot.column) || !Number.isInteger(slot.row)) {
      throw new Error("Bitte eine gültige Hakenposition auswählen.");
    }
    const key = `${slot.column},${slot.row}`;
    const position = grid.find((candidate) => candidate.column === slot.column && candidate.row === slot.row);
    if (!position || used.has(key)) {
      throw new Error("Eine ausgewählte Hakenposition passt nicht mehr auf die Box. Bitte die Auswahl anpassen.");
    }
    used.add(key);
    positions.push(position);
  }
  if (hasCutConflict(positions, cuts)) {
    throw new Error("Eine Öffnung an der Rückseite überschneidet die Befestigung eines Skådis-Hakens.");
  }
  if (body.shape === "roundContainer") {
    for (let i = 0; i < positions.length; i += 1) {
      if (positions.slice(0, i).some((other) => Math.abs(other.x - positions[i].x) < 4.4)) {
        throw new Error("Bei runden Behältern ist nur eine Halterung je Rasterspalte möglich, da sich die Bodenstützen sonst überschneiden.");
      }
      const { support } = getInsertSpec(body, radius, positions[i].x, positions[i].z, 5.5);
      const conflict = cuts.some((cut) => {
        if (cut.face !== "bottom") return false;
        const cutWidth = cut.type === "circle" ? cut.diameter : cut.width;
        const cutDepth = cut.type === "circle" ? cut.diameter : cut.height;
        return Math.abs(cut.u - support.x) < (cutWidth + support.width) / 2
          && Math.abs(cut.v - support.y) < (cutDepth + support.depth) / 2;
      });
      if (conflict) throw new Error("Eine Bodenöffnung überschneidet die Auflage der Skådis-Halterung. Bitte Positionen anpassen.");
    }
  }
  return positions;
}

function findSuggestions(layout, bounds, cuts) {
  const suggestions = [];
  for (const delta of [-1, 1, -2, 2]) {
    const count = layout.count + delta;
    if (count < 1 || count > bounds.maxColumns * bounds.maxRows) {
      continue;
    }
    const alternative = arrangeHooks(count, layout.direction, bounds);
    if (alternative.rows > 1 && alternative.columns > 1
      && alternative.rows * alternative.columns === count
      && !hasCutConflict(alternative.positions, cuts)) {
      suggestions.push({ count, rows: alternative.rows, columns: alternative.columns });
    }
  }
  return suggestions;
}

export function getSkadisPlan(body, boardThickness, radius, cuts, layout) {
  if (!["container", "box", "roundContainer", "cylinder", "sphere"].includes(body.shape)) {
    throw new Error("Für diese Form ist die Skådis-Aufhängung nicht verfügbar.");
  }
  if (!Number.isFinite(boardThickness) || boardThickness < 4 || boardThickness > 7) {
    throw new Error("Die Lochwandstärke muss zwischen 4 und 7 mm liegen.");
  }
  const manual = Object.hasOwn(layout, "positions");
  if (!manual && (!Number.isInteger(layout.count) || layout.count < 1)) {
    throw new Error("Die Anzahl der Skådis-Haken muss eine positive ganze Zahl sein.");
  }
  if (!manual && layout.direction !== "horizontal" && layout.direction !== "vertical") {
    throw new Error("Bitte eine gültige Ausrichtung für die Skådis-Haken auswählen.");
  }
  const minimumWidth = hookWidth + 2 * radius;
  const minimumHookZ = Math.max(radius + shelfHeight / 2, shelfHeight / 2 + tailHeight + 0.01);
  const minimumHeight = minimumHookZ + radius + shelfHeight / 2;
  if (body.width < minimumWidth - 1e-9) {
    throw new Error(`Für diese Hakenanordnung muss die Außenlänge der Box mindestens ${minimumDisplay(minimumWidth)} mm betragen.`);
  }
  if (body.height < minimumHeight - 1e-9) {
    throw new Error(`Für diese Hakenanordnung muss die Außenhöhe der Box mindestens ${minimumDisplay(minimumHeight)} mm betragen.`);
  }
  const minX = -body.width / 2 + radius + hookWidth / 2;
  const maxX = -minX;
  const maxZ = body.height - radius - shelfHeight / 2;
  const maxColumns = gridCapacity(minX, maxX);
  const maxRows = gridCapacity(minimumHookZ, maxZ);
  const bounds = { minX, maxX, minZ: minimumHookZ, maxZ, maxColumns, maxRows, height: body.height };
  if (!manual && layout.count > maxColumns * maxRows) {
    throw new SkadisCapacityError(
      `Auf diese Box passen im 40-mm-Raster höchstens ${maxColumns * maxRows} Haken. Bitte die Box verlängern oder erhöhen.`,
      findSuggestions(layout, bounds, cuts)
    );
  }

  const arrangement = manual
    ? { positions: getManualPositions(body, radius, cuts, layout.positions, layout.offset ?? { x: 0, z: 0 }) }
    : arrangeHooks(layout.count, layout.direction, bounds);
  if (!manual && !["container", "box"].includes(body.shape)) {
    throw new Error("Bitte die Hakenpositionen auf dem Raster auswählen.");
  }
  if (hasCutConflict(arrangement.positions, cuts)) {
    throw new Error("Eine Öffnung an der Rückseite überschneidet die Befestigung eines Skådis-Hakens.");
  }

  const suggestions = !manual && arrangement.rows * arrangement.columns !== layout.count
    ? findSuggestions(layout, bounds, cuts)
    : [];
  const back = body.depth / 2;
  const reach = boardThickness + boardClearance;
  const hooks = arrangement.positions.map(({ x, z }) => ({
    shelf: {
      x,
      y: back + (reach + overlap - rootOverlap) / 2,
      z: z - shelfHeight / 2,
      width: hookWidth,
      depth: reach + overlap + rootOverlap,
      height: shelfHeight
    },
    tail: {
      x,
      y: back + reach + tailDepth / 2,
      z: z - shelfHeight / 2 - tailHeight,
      width: hookWidth,
      depth: tailDepth,
      height: shelfHeight + tailHeight
    }
  }));
  const inserts = ["roundContainer", "cylinder", "sphere"].includes(body.shape)
    ? arrangement.positions.map(({ x, z }) => getInsertSpec(body, radius, x, z, boardThickness))
    : [];
  return { hooks, suggestions, inserts };
}

export function getSkadisHooks(body, boardThickness, radius, cuts, layout) {
  return getSkadisPlan(body, boardThickness, radius, cuts, layout).hooks;
}

export function hasSkadisFeatureConflict(body, features, plan) {
  const areas = plan.inserts.length
    ? plan.inserts.flatMap((insert) => [insert.slot, ...(insert.undercut ? [insert.undercut] : [])])
    : plan.hooks.map((hook) => hook.shelf);
  return features.filter((feature) => feature.type === "hole" || feature.type === "pocket").some((feature) => {
    const diameter = feature.mode === "countersink" ? feature.counterDiameter : feature.diameter;
    const width = feature.type === "hole" ? diameter : feature.width;
    const depth = feature.type === "hole" ? diameter : feature.depth;
    const bottom = feature.type === "pocket" ? body.height - feature.cutDepth
      : feature.mode === "blind" ? body.height - feature.depth : 0;
    return areas.some((area) => Math.abs(feature.x - area.x) < (width + area.width) / 2
      && Math.abs(feature.y - area.y) < (depth + area.depth) / 2
      && bottom < area.z + area.height && body.height > area.z);
  });
}
