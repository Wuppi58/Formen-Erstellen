const faces = ["bottom", "front", "back", "left", "right"];
const types = ["circle", "rectangle"];

export function getCutSpec(body, cut) {
  if (!faces.includes(cut.face) || !types.includes(cut.type)) {
    throw new Error("Unbekannte Fläche oder Form der Öffnung.");
  }
  if (body.shape !== "container" && cut.face !== "bottom") {
    throw new Error("Bei runden Behältern sind Öffnungen derzeit nur im Boden möglich.");
  }

  const width = cut.type === "circle" ? cut.diameter : cut.width;
  const height = cut.type === "circle" ? cut.diameter : cut.height;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 1000)
    || ![cut.u, cut.v].every((value) => Number.isFinite(value) && Math.abs(value) <= 1000)) {
    throw new Error("Öffnungsmaße müssen größer als 0 sein; Positionen und Maße müssen gültig sein.");
  }

  const innerWidth = body.width - 2 * body.wall;
  const innerDepth = body.depth - 2 * body.wall;
  if (cut.face === "bottom") {
    if (body.shape === "roundContainer") {
      const radius = innerWidth / 2;
      const fits = cut.type === "circle"
        ? Math.hypot(cut.u, cut.v) + width / 2 < radius
        : Math.hypot(Math.abs(cut.u) + width / 2, Math.abs(cut.v) + height / 2) < radius;
      if (!fits) {
        throw new Error("Die Öffnung muss vollständig innerhalb der Bodenfläche liegen.");
      }
    } else if (Math.abs(cut.u) + width / 2 >= innerWidth / 2
      || Math.abs(cut.v) + height / 2 >= innerDepth / 2) {
      throw new Error("Die Öffnung muss vollständig innerhalb der Bodenfläche liegen.");
    }
    return {
      center: [cut.u, cut.v, -0.02],
      direction: [0, 0, 1],
      size: [width, height, body.base + 0.04],
      axis: "z"
    };
  }

  const alongX = cut.face === "front" || cut.face === "back";
  const faceWidth = alongX ? innerWidth : innerDepth;
  if (Math.abs(cut.u) + width / 2 >= faceWidth / 2
    || cut.v - height / 2 <= body.base || cut.v + height / 2 >= body.height) {
    throw new Error("Die Öffnung muss vollständig innerhalb der Wandfläche liegen und Abstand zu Boden und Rand haben.");
  }

  const negative = cut.face === "front" || cut.face === "left";
  const offset = (alongX ? body.depth : body.width) / 2;
  const start = negative ? -offset - 0.02 : offset - body.wall - 0.02;
  return {
    center: alongX ? [cut.u, start, cut.v] : [start, cut.u, cut.v],
    direction: alongX ? [0, 1, 0] : [1, 0, 0],
    size: [width, height, body.wall + 0.04],
    axis: alongX ? "y" : "x"
  };
}
