const glyphs = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
};

function normalizeText(text) {
  return String(text ?? "").trim().toUpperCase()
    .replaceAll("Ä", "AE")
    .replaceAll("Ö", "OE")
    .replaceAll("Ü", "UE")
    .replaceAll("ẞ", "SS");
}

function getTextPixels(text) {
  const normalized = normalizeText(text);
  const runs = [];
  for (const [charIndex, character] of [...normalized].entries()) {
    const glyph = glyphs[character];
    if (!glyph) throw new Error("Beschriftungen unterstützen A–Z, 0–9 sowie Leerzeichen, +, -, . und /.");
    for (let row = 0; row < glyph.length; row += 1) {
      let runStart = -1;
      for (let column = 0; column <= glyph[row].length; column += 1) {
        const active = column < glyph[row].length && glyph[row][column] === "1";
        if (active && runStart < 0) {
          runStart = column;
        } else if (!active && runStart >= 0) {
          runs.push({ column: charIndex * 6 + runStart, row, length: column - runStart });
          runStart = -1;
        }
      }
    }
  }
  return { normalized, runs, columns: normalized.length ? normalized.length * 6 - 1 : 0 };
}

export function getGridfinityWallFrame(body, wall) {
  const frames = {
    front: { axis: "x", normalAxis: "y", inwardSign: 1, outerCoord: -body.depth / 2, wallLength: body.width },
    back: { axis: "x", normalAxis: "y", inwardSign: -1, outerCoord: body.depth / 2, wallLength: body.width },
    left: { axis: "y", normalAxis: "x", inwardSign: 1, outerCoord: -body.width / 2, wallLength: body.depth },
    right: { axis: "y", normalAxis: "x", inwardSign: -1, outerCoord: body.width / 2, wallLength: body.depth }
  };
  const frame = frames[wall];
  if (!frame) throw new Error("Bitte eine gültige Boxwand für Griffmulde und Beschriftung auswählen.");
  return { ...frame, innerCoord: frame.outerCoord + frame.inwardSign * body.wall };
}

export function getGridfinityLabelLayout(body, text = "", radius = 0, wall = "front") {
  if (body.shape !== "container") {
    throw new Error("Griffmulde und Beschriftung sind nur für rechteckige Gridfinity-Boxen verfügbar.");
  }
  const wallFrame = getGridfinityWallFrame(body, wall);
  const cornerRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const panelEndMargin = Math.max(body.wall, cornerRadius) + 0.02;
  const scoopWidth = wallFrame.wallLength;
  const panelWidth = wallFrame.wallLength - 2 * panelEndMargin;
  if (scoopWidth < 8) {
    throw new Error("Die Box ist für eine ausreichend breite Griffmulde zu schmal. Mehr Fußraster oder dünnere Wände wählen.");
  }
  const scoopDepth = Math.min(12, (scoopWidth - 3) / 2);
  const scoopRadius = scoopDepth;
  const panelHeight = 13;
  const panelDepth = Math.min(0.6, body.wall * 0.3);
  const panelBottom = body.height - panelHeight;
  const scoopBottom = body.height - scoopDepth;
  if (panelWidth <= 2 * panelDepth + 2 || panelBottom < body.base + 1 || scoopBottom < body.base + 1) {
    throw new Error("Die Box ist für Griffmulde und Beschriftungsfläche zu klein. Höhe oder Fußraster vergrößern.");
  }

  const textInfo = getTextPixels(text);
  let textLayout;
  if (textInfo.normalized) {
    const widthAvailable = panelWidth - 2 * panelDepth - 1.4;
    const heightAvailable = panelHeight - 2 * panelDepth - 0.8;
    const widthScale = widthAvailable / (1.15 * (textInfo.columns - 1) + 1);
    const heightScale = heightAvailable / (1.15 * 6 + 1);
    const pixelSize = Math.min(0.9, widthScale, heightScale);
    if (pixelSize < 0.5) {
      throw new Error("Der Beschriftungstext passt nicht druckbar in die Fläche. Text kürzen oder Box vergrößern.");
    }
    const spacing = pixelSize * 1.15;
    textLayout = {
      value: textInfo.normalized,
      runs: textInfo.runs,
      pixelSize,
      spacing,
      width: (textInfo.columns - 1) * spacing + pixelSize,
      height: 6 * spacing + pixelSize
    };
  }

  return {
    wall: wallFrame,
    topZ: body.height,
    scoop: {
      width: scoopWidth,
      depth: scoopDepth,
      radius: scoopRadius,
      bottomZ: body.height - scoopDepth
    },
    panel: {
      width: panelWidth,
      height: panelHeight,
      depth: panelDepth,
      bottomZ: panelBottom,
      centerCoord: wallFrame.innerCoord + wallFrame.inwardSign * panelHeight / 2,
      surfaceZ: body.height,
      innerWidth: panelWidth - 2 * panelDepth,
      innerHeight: panelHeight - 2 * panelDepth
    },
    text: textLayout
  };
}
