export function getDividerHeight(body, requestedHeight) {
  const maximum = body.height - body.base;
  if (requestedHeight === null) return maximum;
  if (!Number.isFinite(requestedHeight) || requestedHeight < 0.1 || requestedHeight > maximum) {
    throw new Error("Die Fächerhöhe muss mindestens 0,1 mm betragen und in die Innenhöhe der Box passen.");
  }
  return requestedHeight;
}

export function getLidDividerNotchDepth(body, dividerHeight, insertDepth, clearance) {
  const gap = body.height - body.base - dividerHeight;
  return Math.max(0, Math.min(insertDepth, insertDepth - gap + clearance));
}

export function getDividerLayout(body, countX, countY, fractionsX, fractionsY, defaultHeight, heights = {}) {
  const width = body.width - 2 * body.wall;
  const depth = body.depth - 2 * body.wall;
  const boundaries = (size, count, fractions) => {
    if (!Array.isArray(fractions) || fractions.length !== count - 1) {
      throw new Error("Die Fächeraufteilung ist ungültig.");
    }
    return [-size / 2, ...fractions.map((fraction) => -size / 2 + fraction * size), size / 2];
  };
  const xs = boundaries(width, countX, fractionsX);
  const ys = boundaries(depth, countY, fractionsY);
  const getCells = (points) => points.slice(0, -1).map((start, index) => {
    const min = start + (index > 0 ? body.wall / 2 : 0);
    const max = points[index + 1] - (index < points.length - 2 ? body.wall / 2 : 0);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 0.1 - 1e-8) {
      throw new Error("Ein Fach ist zu schmal. Bitte die Fächermaße oder die Boxgröße anpassen.");
    }
    return { min, max, size: max - min };
  });
  const columns = getCells(xs);
  const rows = getCells(ys);
  const segments = [];
  const addSegments = (axis, boundariesInAxis, otherBoundaries) => {
    for (let boundary = 1; boundary < boundariesInAxis.length - 1; boundary += 1) {
      for (let cell = 0; cell < otherBoundaries.length - 1; cell += 1) {
        const key = `${axis}:${boundary}:${cell}`;
        const height = getDividerHeight(body, Object.hasOwn(heights, key) ? heights[key] : defaultHeight);
        const start = otherBoundaries[cell];
        const end = otherBoundaries[cell + 1];
        const previous = segments[segments.length - 1];
        if (previous && previous.axis === axis && previous.boundary === boundary
          && previous.height === height && previous.end === start) {
          previous.end = end;
        } else {
          segments.push({ axis, boundary, position: boundariesInAxis[boundary], start, end, height });
        }
      }
    }
  };
  addSegments("x", xs, ys);
  addSegments("y", ys, xs);
  return { columns, rows, segments };
}

export function resizeDividerCell(body, layout, axis, index, size, fractions) {
  const cells = axis === "x" ? layout.columns : layout.rows;
  if (!Number.isFinite(size) || size < 0.1 || cells.length < 2 || !cells[index]) {
    throw new Error("Das Fachmaß muss mindestens 0,1 mm betragen und eine verschiebbare Trennwand haben.");
  }
  const next = [...fractions];
  const delta = size - cells[index].size;
  const boundary = index === cells.length - 1 ? index - 1 : index;
  const neighbor = index === cells.length - 1 ? index - 1 : index + 1;
  if (cells[neighbor].size - delta < 0.1 - 1e-8) {
    throw new Error("Das Nachbarfach würde zu klein. Bitte ein kleineres Maß wählen.");
  }
  const innerSize = (axis === "x" ? body.width : body.depth) - 2 * body.wall;
  next[boundary] += (index === cells.length - 1 ? -delta : delta) / innerSize;
  return next;
}

export function getCellDividerKeys(column, row, countX, countY) {
  const keys = [];
  if (column > 0) keys.push(`x:${column}:${row}`);
  if (column < countX - 1) keys.push(`x:${column + 1}:${row}`);
  if (row > 0) keys.push(`y:${row}:${column}`);
  if (row < countY - 1) keys.push(`y:${row + 1}:${column}`);
  return keys;
}
