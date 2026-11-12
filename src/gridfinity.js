export const GRIDFINITY_PITCHES = [42, 21, 14];
export const GRIDFINITY_FOOT_HEIGHT = 4.75;
export const GRIDFINITY_MAX_CELLS = 64;

export function snapGridfinityDimension(dimension, pitch) {
  if (!Number.isFinite(dimension) || dimension <= 0 || !GRIDFINITY_PITCHES.includes(pitch)) {
    throw new Error("Bitte gültige Boxmaße und eine Rastergröße wählen.");
  }
  return Math.max(1, Math.ceil((dimension + 0.5 - 1e-8) / pitch)) * pitch - 0.5;
}

export function gridfinityCount(dimension, pitch) {
  const count = (dimension + 0.5) / pitch;
  return Math.abs(count - Math.round(count)) < 1e-7 ? Math.round(count) : NaN;
}

export function gridfinityBoxDimensions(columns, rows, pitch) {
  if (!GRIDFINITY_PITCHES.includes(pitch)) throw new Error("Bitte eine gültige Gridfinity-Rastergröße wählen.");
  if (![columns, rows].every((n) => Number.isInteger(n) && n >= 1)
    || columns * rows > GRIDFINITY_MAX_CELLS) {
    throw new Error(`Die Box benötigt ganze Fußzahlen ab 1 und darf höchstens ${GRIDFINITY_MAX_CELLS} Füße haben.`);
  }
  const width = columns * pitch - 0.5;
  const depth = rows * pitch - 0.5;
  if (width > 1000 || depth > 1000) throw new Error("Die gewählte Fußanzahl ergibt ein Boxmaß über 1.000 mm.");
  return { width, depth };
}

export function getGridfinityLayout(body, pitch, plateColumns, plateRows, column, row) {
  if (body.shape !== "container") throw new Error("Gridfinity-Füße sind derzeit nur für rechteckige Boxen verfügbar.");
  if (!GRIDFINITY_PITCHES.includes(pitch)) throw new Error("Bitte eine gültige Gridfinity-Rastergröße wählen.");
  const columns = gridfinityCount(body.width, pitch);
  const rows = gridfinityCount(body.depth, pitch);
  if (![columns, rows].every((n) => Number.isInteger(n) && n >= 1)) {
    throw new Error("Die Außenmaße der Box müssen zum Gridfinity-Raster passen. Maße nach der Eingabe bestätigen.");
  }
  if (columns * rows > GRIDFINITY_MAX_CELLS) throw new Error(`Die Box darf höchstens ${GRIDFINITY_MAX_CELLS} Gridfinity-Füße haben.`);
  if (![plateColumns, plateRows].every((n) => Number.isInteger(n) && n >= 1)
    || plateColumns * plateRows > GRIDFINITY_MAX_CELLS
    || plateColumns * pitch > 1000 || plateRows * pitch > 1000) {
    throw new Error(`Die Grundplatte benötigt gültige Rastermaße und darf höchstens ${GRIDFINITY_MAX_CELLS} Felder und 1.000 mm je Seite haben.`);
  }
  if (![column, row].every((n) => Number.isInteger(n) && n >= 0)
    || column + columns > plateColumns || row + rows > plateRows) {
    throw new Error("Die Box passt an dieser Position nicht auf die Grundplatte. Platte oder Position anpassen.");
  }
  return { pitch, columns, rows, plateColumns, plateRows, column, row };
}

export function gridfinityFootProfile(pitch) {
  return [
    { z: -4.75, width: pitch - 6.4, radius: 0.8 },
    { z: -3.95, width: pitch - 4.8, radius: 1.6 },
    { z: -2.15, width: pitch - 4.8, radius: 1.6 },
    { z: 0, width: pitch - 0.5, radius: 3.75 },
    { z: 0.02, width: pitch - 0.5, radius: 3.75 }
  ];
}

export function gridfinitySocketProfile(pitch) {
  return [
    { z: -0.02, width: pitch - 5.7, radius: 1.15 },
    { z: 0.35, width: pitch - 5.7, radius: 1.15 },
    { z: 1.05, width: pitch - 4.3, radius: 1.85 },
    { z: 2.85, width: pitch - 4.3, radius: 1.85 },
    { z: 5, width: pitch, radius: 4 },
    { z: 5.02, width: pitch + 0.04, radius: 4.02 }
  ];
}

export function gridfinityPlateOffset(layout) {
  return {
    x: ((layout.plateColumns - layout.columns) / 2 - layout.column) * layout.pitch,
    y: ((layout.plateRows - layout.rows) / 2 - layout.row) * layout.pitch
  };
}
