import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import openCascadeModule from "opencascade.js/dist/opencascade.full.js";
import openCascadeWasmUrl from "opencascade.js/dist/opencascade.full.wasm?url";
import { getCutSpec } from "./container-cuts.js";
import { getCellDividerKeys, getDividerHeight, getDividerLayout, getLidDividerNotchDepth, resizeDividerCell } from "./container-dividers.js";
import { getSkadisGrid, getSkadisPlan, hasSkadisFeatureConflict } from "./skadis.js";
import { getInsertSpec, getSkadisBoardOffset } from "./skadis-inserts.js";
import { getBoxEdges, getRoundedCellOutline, getVerticalEdges, matchesBoxEdge, polygonArea, roundedCutFits, verticalRoundingFits } from "./box-edges.js";
import { GRIDFINITY_FOOT_HEIGHT, getGridfinityLayout, gridfinityBoxDimensions, gridfinityCount, gridfinityFootProfile, gridfinityPlateOffset, gridfinitySocketProfile, snapGridfinityDimension } from "./gridfinity.js";

const bodyShape = document.querySelector("#body-shape");
const bodyFields = document.querySelector("#body-fields");
const featureList = document.querySelector("#feature-list");
const featureCount = document.querySelector("#feature-count");
const radiusInput = document.querySelector("#fillet-radius");
const edgeOptions = document.querySelector("#edge-options");
const edgeList = document.querySelector("#edge-list");
const edgeMode = document.querySelector("#edge-mode");
const exportButton = document.querySelector("#export-stl");
const modelStatus = document.querySelector("#model-status");
const modelInfo = document.querySelector("#model-info");
const placeholder = document.querySelector("#viewport-placeholder");
const canvas = document.querySelector("#viewport");
const viewportWrap = document.querySelector("#viewport-wrap");
const containerSettings = document.querySelector("#container-settings");
const measureMode = document.querySelector("#measure-mode");
const wallInput = document.querySelector("#wall-thickness");
const baseInput = document.querySelector("#base-thickness");
const containerMeasures = document.querySelector("#container-measures");
const boxOptions = document.querySelector("#box-options");
const solidFeatures = document.querySelector("#solid-features");
const containerCutsPanel = document.querySelector("#container-cuts");
const skadisEnabled = document.querySelector("#skadis-enabled");
const skadisSettings = document.querySelector("#skadis-settings");
const skadisBoardThickness = document.querySelector("#skadis-board-thickness");
const skadisOffsetX = document.querySelector("#skadis-offset-x");
const skadisOffsetZ = document.querySelector("#skadis-offset-z");
const skadisMove = document.querySelector("#skadis-move");
const skadisExportOptions = document.querySelector("#skadis-export-options");
const skadisExportSelect = document.querySelector("#skadis-export-select");
const exportSkadisHookButton = document.querySelector("#export-skadis-hook");
const skadisExportHint = document.querySelector("#skadis-export-hint");
const roundSkadisHint = document.querySelector("#round-skadis-hint");
const skadisCount = document.querySelector("#skadis-count");
const skadisPicker = document.querySelector("#skadis-picker");
const skadisInvalid = document.querySelector("#skadis-invalid");
const backViewButton = document.querySelector("#back-view");
const cutList = document.querySelector("#cut-list");
const cutCount = document.querySelector("#cut-count");
const dividerOptions = document.querySelector("#divider-options");
const dividerHeightHint = document.querySelector("#divider-height-hint");
const dividerHeightInput = document.querySelector("#divider-height");
const compartmentsX = document.querySelector("#compartments-x");
const compartmentsY = document.querySelector("#compartments-y");
const cellOptions = document.querySelector("#cell-options");
const cellSelect = document.querySelector("#cell-select");
const cellFields = document.querySelector("#cell-fields");
const cellWidth = document.querySelector("#cell-width");
const cellDepth = document.querySelector("#cell-depth");
const cellHeight = document.querySelector("#cell-height");
const cellHeightInfo = document.querySelector("#cell-height-info");
const lidEnabled = document.querySelector("#lid-enabled");
const lidOptions = document.querySelector("#lid-options");
const lidThickness = document.querySelector("#lid-thickness");
const lidClearance = document.querySelector("#lid-clearance");
const lidInsertDepth = document.querySelector("#lid-insert-depth");
const exportLidButton = document.querySelector("#export-lid");
const gridfinityEnabled = document.querySelector("#gridfinity-enabled");
const gridfinitySettings = document.querySelector("#gridfinity-settings");
const gridfinityPitch = document.querySelector("#gridfinity-pitch");
const gridfinityFeetX = document.querySelector("#gridfinity-feet-x");
const gridfinityFeetY = document.querySelector("#gridfinity-feet-y");
const gridfinityColumns = document.querySelector("#gridfinity-columns");
const gridfinityRows = document.querySelector("#gridfinity-rows");
const gridfinityColumn = document.querySelector("#gridfinity-column");
const gridfinityRow = document.querySelector("#gridfinity-row");
const gridfinityMove = document.querySelector("#gridfinity-move");
const exportGridfinityButton = document.querySelector("#export-gridfinity");
const shapeLabels = { container: "Box", roundContainer: "Runder Behälter", box: "Quader", cylinder: "Zylinder", sphere: "Kugel" };
const initialBody = { shape: "container", width: 60, depth: 40, height: 40 };

let oc;
let currentShape;
let currentLid;
let currentModelUrl;
let rebuildTimer;
let nextFeatureId = 1;
let nextCutId = 1;
let modelVersion = 0;
let buildFailed = false;
let scene;
let camera;
let renderer;
let controls;
let modelRoot;
let lastCameraPosition;
let skadisOverlay;
let skadisPointerStart;
let skadisDrag;
let cellOverlay;
let edgeOverlay;
let gridfinityOverlay;
let gridfinityDrag;
let gridfinityCountError = "";
let gridfinityResizePending = false;
let selectedCell;
let cellInputErrors = {};
let dividerState = { countX: 1, countY: 1, fractionsX: [], fractionsY: [], heights: {} };
const selectedEdges = new Set([...getBoxEdges(initialBody).map((edge) => edge.id), "ring-bottom", "ring-top"]);

const features = [];
const containerCuts = [];
const skadisSelection = [];

function initializeOpenCascade() {
  return openCascadeModule({
    locateFile(path) {
      return path.endsWith(".wasm") ? openCascadeWasmUrl : path;
    }
  });
}

function setStatus(message, kind = "") {
  modelStatus.textContent = message;
  modelStatus.className = `model-status${kind ? ` ${kind}` : ""}`;
}

function numberField(label, value, property, min = 0.1, step = 0.1) {
  return `<label class="field-group">
    <span class="field-label">${label}</span>
    <input class="field-input" type="number" min="${min}" max="1000" step="${step}" value="${value}" data-feature-prop="${property}" aria-label="${label}">
  </label>`;
}

function bodyField(label, value, property) {
  return `<label class="field-group">
    <span class="field-label">${label}</span>
    <input class="field-input" type="number" min="0.1" max="1000" step="0.1" value="${value}" data-body-prop="${property}" aria-label="${label} in Millimetern">
  </label>`;
}

function renderBodyFields() {
  const shape = bodyShape.value;
  const isSphere = shape === "sphere";
  const isContainer = shape === "container" || shape === "roundContainer";
  containerSettings.hidden = !isContainer;
  boxOptions.hidden = !isContainer;
  solidFeatures.hidden = isContainer;
  containerCutsPanel.hidden = !isContainer;
  backViewButton.hidden = !skadisEnabled.checked;
  dividerOptions.hidden = shape !== "container";
  dividerHeightHint.hidden = shape !== "container";
  cellOptions.hidden = shape !== "container";
  exportLidButton.hidden = !isContainer || !lidEnabled.checked;
  radiusInput.disabled = isSphere;
  edgeOptions.hidden = isSphere;
  roundSkadisHint.hidden = shape !== "roundContainer";
  if (edgeOptions.hidden) edgeMode.setAttribute("aria-pressed", "false");
  if (isSphere) {
    radiusInput.value = "0";
  }
  if (shape === "sphere") {
    bodyFields.innerHTML = bodyField("Durchmesser", initialBody.width, "width");
  } else if (shape === "cylinder" || shape === "roundContainer") {
    bodyFields.innerHTML = bodyField("Durchmesser", initialBody.width, "width")
      + bodyField("Höhe", initialBody.height, "height");
  } else {
    bodyFields.innerHTML = bodyField("Länge", initialBody.width, "width")
      + bodyField("Breite", initialBody.depth, "depth")
      + bodyField("Höhe", initialBody.height, "height");
  }
}

function selectableEdges(body) {
  if (body.shape === "box" || body.shape === "container") return getBoxEdges(body);
  if (body.shape === "cylinder" || body.shape === "roundContainer") {
    return [0, body.height].map((z, index) => ({
      id: index ? "ring-top" : "ring-bottom",
      label: index ? "Oberer Kreisrand" : "Unterer Kreisrand",
      start: [0, -body.width / 2, z],
      end: [0, -body.width / 2, z]
    }));
  }
  return [];
}

function activeEdges(body) {
  return selectableEdges(body).filter((edge) => selectedEdges.has(edge.id)).map((edge) => edge.id);
}

function renderEdgeList() {
  const legend = edgeList.querySelector("legend");
  edgeList.replaceChildren(legend);
  for (const edge of selectableEdges(readBody())) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.edgeId = edge.id;
    input.checked = selectedEdges.has(edge.id);
    label.append(input, document.createTextNode(edge.label));
    edgeList.appendChild(label);
  }
}

function renderEdgeOverlay() {
  if (edgeOverlay) {
    scene.remove(edgeOverlay);
    edgeOverlay.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    edgeOverlay = undefined;
  }
  if (!modelRoot || edgeOptions.hidden || edgeMode.getAttribute("aria-pressed") !== "true") return;
  const body = readBody();
  if (!body.inputDimensionsValid) return;
  const markerSize = Math.max(0.7, Math.min(body.width, body.depth, body.height) * 0.035);
  edgeOverlay = new THREE.Group();
  for (const edge of selectableEdges(body)) {
    const point = edge.start.map((value, index) => (value + edge.end[index]) / 2);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(markerSize, 12, 8),
      new THREE.MeshBasicMaterial({ color: selectedEdges.has(edge.id) ? "#e68c2f" : "#547b95" }));
    marker.position.set(modelRoot.position.x + point[0], modelRoot.position.y + point[2], modelRoot.position.z - point[1]);
    marker.userData.edgeId = edge.id;
    edgeOverlay.add(marker);
  }
  scene.add(edgeOverlay);
  edgeOverlay.updateMatrixWorld(true);
}

function updateEdgeSelection(id, checked) {
  if (checked) selectedEdges.add(id);
  else selectedEdges.delete(id);
  renderEdgeList();
  renderEdgeOverlay();
  scheduleUpdate();
}

function featureFields(feature) {
  if (feature.type === "hole") {
    const modeOptions = [
      ["through", "Durchgang"],
      ["blind", "Sackloch"],
      ["countersink", "Mit Senkung"]
    ].map(([value, label]) => `<option value="${value}"${feature.mode === value ? " selected" : ""}>${label}</option>`).join("");
    let markup = `<label class="field-group field-span">
      <span class="field-label">Bohrungsart</span>
      <select class="select-control" data-feature-prop="mode" aria-label="Bohrungsart">${modeOptions}</select>
    </label>`;
    markup += numberField("Durchmesser", feature.diameter, "diameter");
    markup += numberField("Position X", feature.x, "x", -1000);
    markup += numberField("Position Y", feature.y, "y", -1000);
    if (feature.mode === "blind") {
      markup += numberField("Tiefe", feature.depth, "depth");
    }
    if (feature.mode === "countersink") {
      markup += numberField("Senk-Ø", feature.counterDiameter, "counterDiameter");
      markup += numberField("Senktiefe", feature.counterDepth, "counterDepth");
    }
    return markup;
  }
  if (feature.type === "pocket") {
    return numberField("Länge", feature.width, "width")
      + numberField("Breite", feature.depth, "depth")
      + numberField("Position X", feature.x, "x", -1000)
      + numberField("Position Y", feature.y, "y", -1000)
      + numberField("Ausschnitttiefe", feature.cutDepth, "cutDepth");
  }
  if (feature.type === "bossCylinder") {
    return numberField("Durchmesser", feature.diameter, "diameter")
      + numberField("Höhe", feature.height, "height")
      + numberField("Position X", feature.x, "x", -1000)
      + numberField("Position Y", feature.y, "y", -1000);
  }
  return numberField("Länge", feature.width, "width")
    + numberField("Breite", feature.depth, "depth")
    + numberField("Höhe", feature.height, "height")
    + numberField("Position X", feature.x, "x", -1000)
    + numberField("Position Y", feature.y, "y", -1000);
}

function featureHeading(feature, index) {
  const labels = {
    hole: "Bohrung",
    pocket: "Rechtecktasche",
    bossCylinder: "Zylinder hinzufügen",
    bossBox: "Quader hinzufügen"
  };
  const isAddition = feature.type.startsWith("boss");
  return `<div class="feature-item-head">
    <strong class="feature-title"><i class="legend-dot ${isAddition ? "add" : "cut"}"></i>${labels[feature.type]} ${index + 1}</strong>
    <button class="remove-feature" type="button" data-remove-feature="${feature.id}" aria-label="${labels[feature.type]} entfernen">×</button>
  </div>`;
}

function renderFeatures() {
  featureCount.textContent = String(features.length);
  featureList.innerHTML = features.length
    ? features.map((feature, index) => `<article class="feature-item" data-feature-id="${feature.id}">
        ${featureHeading(feature, index)}
        <div class="feature-fields">${featureFields(feature)}</div>
      </article>`).join("")
    : '<div class="feature-empty">Noch keine zusätzlichen Geometrien.</div>';
}

function cutField(label, value, property, min) {
  const displayValue = Number.isFinite(value) ? value : "";
  return `<label class="field-group">
    <span class="field-label">${label} (mm)</span>
    <input class="field-input" type="number" min="${min}" max="1000" step="0.1" value="${displayValue}" data-cut-prop="${property}" aria-label="${label} in Millimetern">
  </label>`;
}

function renderCuts() {
  const faces = [
    ["bottom", "Boden"],
    ["front", "Vorne (−Y)"],
    ["back", "Hinten (+Y)"],
    ["left", "Links (−X)"],
    ["right", "Rechts (+X)"]
  ];
  cutCount.textContent = String(containerCuts.length);
  cutList.innerHTML = containerCuts.length
    ? containerCuts.map((cut, index) => {
      const title = cut.type === "circle" ? "Rundes Loch" : "Rechteckiger Ausschnitt";
      const horizontalLabel = cut.face === "left" || cut.face === "right" ? "Position Y" : "Position X";
      const verticalLabel = cut.face === "bottom" ? "Position Y" : "Höhe Z ab Boden";
      const options = faces.map(([value, label]) => `<option value="${value}"${cut.face === value ? " selected" : ""}>${label}</option>`).join("");
      const dimensions = cut.type === "circle"
        ? cutField("Durchmesser", cut.diameter, "diameter", 0.1)
        : cutField("Breite", cut.width, "width", 0.1) + cutField(cut.face === "bottom" ? "Länge Y" : "Höhe", cut.height, "height", 0.1);
      return `<article class="feature-item" data-cut-id="${cut.id}">
        <div class="feature-item-head">
          <strong class="feature-title"><i class="legend-dot cut"></i>${title} ${index + 1}</strong>
          <button class="remove-feature" type="button" data-remove-cut="${cut.id}" aria-label="${title} ${index + 1} entfernen">×</button>
        </div>
        <div class="feature-fields">
          <label class="field-group"><span class="field-label">Fläche</span>
            <select class="select-control" data-cut-prop="face" aria-label="Fläche für ${title} ${index + 1}">${options}</select>
          </label>
          ${dimensions}
          ${cutField(horizontalLabel, cut.u, "u", -1000)}
          ${cutField(verticalLabel, cut.v, "v", cut.face === "bottom" ? -1000 : 0)}
        </div>
      </article>`;
    }).join("")
    : '<div class="feature-empty">Noch keine Öffnungen hinzugefügt.</div>';
}

function readBody() {
  const values = { ...initialBody, shape: bodyShape.value };
  bodyFields.querySelectorAll("[data-body-prop]").forEach((input) => {
    values[input.dataset.bodyProp] = Number(input.value);
  });
  values.inputDimensionsValid = [...bodyFields.querySelectorAll("[data-body-prop]")]
    .every((input) => input.value !== "" && Number.isFinite(Number(input.value)) && Number(input.value) > 0 && Number(input.value) <= 1000);
  values.isContainer = values.shape === "container" || values.shape === "roundContainer";
  values.wall = Number(wallInput.value);
  values.base = Number(baseInput.value);
  if (values.isContainer && measureMode.value === "inside") {
    values.width += 2 * values.wall;
    if (values.shape === "container") {
      values.depth += 2 * values.wall;
    }
    values.height += values.base;
  }
  if (values.shape === "cylinder" || values.shape === "roundContainer") {
    values.depth = values.width;
  }
  if (values.shape === "sphere") {
    values.depth = values.width;
    values.height = values.width;
  }
  return values;
}

function readSkadisLayout() {
  return { positions: skadisSelection, offset: { x: skadisOffsetX.valueAsNumber, z: skadisOffsetZ.valueAsNumber } };
}

function readGridfinityLayout(body) {
  if (body.shape !== "container") throw new Error("Gridfinity-Füße sind derzeit nur für rechteckige Boxen verfügbar.");
  const pitch = Number(gridfinityPitch.value);
  const dimensions = gridfinityBoxDimensions(gridfinityFeetX.valueAsNumber, gridfinityFeetY.valueAsNumber, pitch);
  if (Math.abs(body.width - dimensions.width) > 1e-6 || Math.abs(body.depth - dimensions.depth) > 1e-6) {
    throw new Error("Fußanzahl und Boxmaße stimmen nicht überein. Bitte die Maße bestätigen.");
  }
  return getGridfinityLayout(body, pitch,
    gridfinityColumns.valueAsNumber, gridfinityRows.valueAsNumber, gridfinityColumn.valueAsNumber, gridfinityRow.valueAsNumber);
}

function fitGridfinityPlate(columns, rows) {
  for (const [count, plateInput, positionInput] of [
    [columns, gridfinityColumns, gridfinityColumn],
    [rows, gridfinityRows, gridfinityRow]
  ]) {
    if (count > plateInput.valueAsNumber) plateInput.value = String(count);
    if (positionInput.valueAsNumber + count > plateInput.valueAsNumber) {
      positionInput.value = String(Math.max(0, plateInput.valueAsNumber - count));
    }
  }
}

function resizeGridfinityBody() {
  gridfinityResizePending = true;
  try {
    if (bodyShape.value !== "container") throw new Error("Gridfinity-Füße sind derzeit nur für rechteckige Boxen verfügbar.");
    const dimensions = gridfinityBoxDimensions(gridfinityFeetX.valueAsNumber, gridfinityFeetY.valueAsNumber, Number(gridfinityPitch.value));
    const wall = wallInput.valueAsNumber;
    if (!Number.isFinite(wall) || wall < 0.5 || wall > 50) throw new Error("Bitte eine gültige Wandstärke eingeben.");
    if (measureMode.value === "inside" && Math.min(dimensions.width, dimensions.depth) <= 2 * wall) {
      throw new Error("Die gewählte Fußanzahl ist für diese Wandstärke zu klein. Wandstärke oder Fußanzahl anpassen.");
    }
    for (const property of ["width", "depth"]) {
      const value = dimensions[property] - (measureMode.value === "inside" ? 2 * wall : 0);
      bodyFields.querySelector(`[data-body-prop="${property}"]`).value = String(Number(value.toFixed(8)));
      initialBody[property] = value;
    }
    fitGridfinityPlate(gridfinityFeetX.valueAsNumber, gridfinityFeetY.valueAsNumber);
    gridfinityCountError = "";
    gridfinityResizePending = false;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    gridfinityCountError = error.message;
  }
}

function snapGridfinityBody() {
  const body = readBody();
  if (!gridfinityEnabled.checked || body.shape !== "container" || !body.inputDimensionsValid
    || !Number.isFinite(body.wall)) return;
  const pitch = Number(gridfinityPitch.value);
  for (const property of ["width", "depth"]) {
    const outside = snapGridfinityDimension(body[property], pitch);
    const value = outside - (measureMode.value === "inside" ? 2 * body.wall : 0);
    bodyFields.querySelector(`[data-body-prop="${property}"]`).value = String(Number(value.toFixed(8)));
    initialBody[property] = value;
  }
  const snapped = readBody();
  const columns = gridfinityCount(snapped.width, pitch);
  const rows = gridfinityCount(snapped.depth, pitch);
  gridfinityFeetX.value = String(columns);
  gridfinityFeetY.value = String(rows);
  fitGridfinityPlate(columns, rows);
  gridfinityCountError = "";
  gridfinityResizePending = false;
}

function skadisRadius(body, radius) {
  if ((body.shape === "box" || body.shape === "container")
    && !activeEdges(body).some((id) => !id.startsWith("vertical-front-"))) return 0;
  return radius;
}

function readDividerHeight(body) {
  const requested = dividerHeightInput.value === "" && !dividerHeightInput.validity.badInput
    ? null : dividerHeightInput.valueAsNumber;
  return getDividerHeight(body, requested);
}

function readDividerLayout(body) {
  return getDividerLayout(body, dividerState.countX, dividerState.countY,
    dividerState.fractionsX, dividerState.fractionsY, readDividerHeight(body), dividerState.heights);
}

function resetDividerCounts() {
  const countX = compartmentsX.valueAsNumber;
  const countY = compartmentsY.valueAsNumber;
  if (![countX, countY].every((count) => Number.isInteger(count) && count >= 1 && count <= 10)) return;
  if (countX === dividerState.countX && countY === dividerState.countY) return;
  dividerState = {
    countX, countY,
    fractionsX: Array.from({ length: countX - 1 }, (_, index) => (index + 1) / countX),
    fractionsY: Array.from({ length: countY - 1 }, (_, index) => (index + 1) / countY),
    heights: {}
  };
  selectedCell = undefined;
  cellInputErrors = {};
  cellFields.hidden = true;
}

function refreshCellControls(body, force = false) {
  if (body.shape !== "container") return;
  const layout = readDividerLayout(body);
  const value = selectedCell ? `${selectedCell.column},${selectedCell.row}` : "";
  cellSelect.replaceChildren(new Option("In der 3D-Vorschau anklicken …", ""));
  for (let row = 0; row < dividerState.countY; row += 1) {
    for (let column = 0; column < dividerState.countX; column += 1) {
      cellSelect.add(new Option(`Fach: Spalte ${column + 1}, Reihe ${row + 1}`, `${column},${row}`));
    }
  }
  cellSelect.value = value;
  cellFields.hidden = !selectedCell;
  cellHeightInfo.hidden = !selectedCell;
  if (!selectedCell) return;
  const { column, row } = selectedCell;
  if (force || document.activeElement !== cellWidth) cellWidth.value = Number(layout.columns[column].size.toFixed(2));
  if (force || document.activeElement !== cellDepth) cellDepth.value = Number(layout.rows[row].size.toFixed(2));
  cellWidth.disabled = dividerState.countX === 1;
  cellDepth.disabled = dividerState.countY === 1;
  const keys = getCellDividerKeys(column, row, dividerState.countX, dividerState.countY);
  const defaultHeight = readDividerHeight(body);
  const values = keys.map((key) => Object.hasOwn(dividerState.heights, key) ? dividerState.heights[key] : defaultHeight);
  const mixed = values.some((height) => height !== values[0]);
  if (force || document.activeElement !== cellHeight) {
    cellHeight.value = keys.length && !mixed ? values[0] : "";
  }
  cellHeight.placeholder = mixed ? "Unterschiedlich" : "";
  cellHeight.disabled = keys.length === 0;
  cellHeightInfo.textContent = !keys.length ? "Dieses Fach hat keine inneren Trennwände."
    : mixed ? "Angrenzende Wände haben unterschiedliche Höhen. Eine Eingabe setzt sie auf denselben Wert."
      : "Die Höhe gilt für alle angrenzenden inneren Wände, auch auf der Seite des Nachbarfachs.";
}

function renderCellOverlay(body) {
  if (cellOverlay) {
    scene.remove(cellOverlay);
    cellOverlay.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    cellOverlay = undefined;
  }
  if (!modelRoot || body.shape !== "container") return;
  const layout = readDividerLayout(body);
  cellOverlay = new THREE.Group();
  layout.rows.forEach((row, rowIndex) => {
    layout.columns.forEach((column, columnIndex) => {
      const selected = selectedCell?.column === columnIndex && selectedCell?.row === rowIndex;
      const points = getRoundedCellOutline(body, radiusInput.valueAsNumber, [...selectedEdges], column, row);
      if (points.length < 3) return;
      const outline = new THREE.Shape();
      outline.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) outline.lineTo(point[0], point[1]);
      outline.closePath();
      const plane = new THREE.Mesh(new THREE.ShapeGeometry(outline),
        new THREE.MeshBasicMaterial({ color: selected ? "#ecb460" : "#c2e0d0", transparent: true,
          opacity: selected ? 0.55 : 0.18, depthWrite: false, side: THREE.DoubleSide }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(modelRoot.position.x, modelRoot.position.y + body.base + 0.05, modelRoot.position.z);
      plane.userData.cell = { column: columnIndex, row: rowIndex };
      cellOverlay.add(plane);
    });
  });
  scene.add(cellOverlay);
  cellOverlay.updateMatrixWorld(true);
}

function selectCell(cell) {
  const hadError = Object.keys(cellInputErrors).length > 0;
  selectedCell = cell;
  cellInputErrors = {};
  const body = readBody();
  try {
    refreshCellControls(body, true);
    renderCellOverlay(body);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    setStatus(error.message, "error");
    return;
  }
  if (hadError) scheduleUpdate();
}

function editCell(input) {
  if (!selectedCell) return;
  try {
    const body = readBody();
    const layout = readDividerLayout(body);
    if (input === cellHeight) {
      const height = getDividerHeight(body, input.valueAsNumber);
      const keys = getCellDividerKeys(selectedCell.column, selectedCell.row, dividerState.countX, dividerState.countY);
      keys.forEach((key) => { dividerState.heights[key] = height; });
    } else {
      const axis = input === cellWidth ? "x" : "y";
      const index = axis === "x" ? selectedCell.column : selectedCell.row;
      const key = axis === "x" ? "fractionsX" : "fractionsY";
      dividerState[key] = resizeDividerCell(body, layout, axis, index, input.valueAsNumber, dividerState[key]);
    }
    delete cellInputErrors[input.id];
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    cellInputErrors[input.id] = error.message;
  }
  scheduleUpdate();
}

function isSkadisSelected(slot) {
  return skadisSelection.some((selected) => selected.column === slot.column && selected.row === slot.row);
}

function toggleSkadisSlot(column, row) {
  const index = skadisSelection.findIndex((slot) => slot.column === column && slot.row === row);
  if (index >= 0) {
    skadisSelection.splice(index, 1);
  } else {
    skadisSelection.push({ column, row });
  }
  scheduleUpdate();
}

function clearSkadisOverlay() {
  if (!skadisOverlay) return;
  scene.remove(skadisOverlay);
  const geometries = new Set();
  const materials = new Set();
  skadisOverlay.traverse((object) => {
    if (object.isMesh) {
      geometries.add(object.geometry);
      materials.add(object.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  skadisOverlay = undefined;
}

function renderSkadisPicker() {
  const focused = skadisPicker.contains(document.activeElement)
    ? { column: document.activeElement.dataset.column, row: document.activeElement.dataset.row }
    : undefined;
  clearSkadisOverlay();
  skadisCount.textContent = `${skadisSelection.length} Haken`;
  skadisPicker.replaceChildren();
  skadisInvalid.replaceChildren();
  const body = readBody();
  const separate = ["roundContainer", "cylinder", "sphere"].includes(body.shape);
  skadisExportHint.textContent = body.shape === "roundContainer"
    ? "Jede Halterung einzeln exportieren. Die obere Nase in den Schlitz einsetzen und den Behälter auf die untere Stütze absenken. Nur eine Halterung je Rasterspalte; die Schlitze öffnen die Behälterwand."
    : "Für jede gewählte Position den passenden Haken separat exportieren.";
  skadisExportOptions.hidden = !skadisEnabled.checked || !separate || !skadisSelection.length;
  const previous = skadisExportSelect.value;
  skadisExportSelect.replaceChildren();
  skadisSelection.forEach((slot, index) => {
    const option = document.createElement("option");
    option.value = `${slot.column},${slot.row}`;
    option.textContent = `Haken ${index + 1} (Raster ${slot.column}, ${slot.row})`;
    skadisExportSelect.appendChild(option);
  });
  if ([...skadisExportSelect.options].some((option) => option.value === previous)) skadisExportSelect.value = previous;
  if (!skadisEnabled.checked || !body.inputDimensionsValid) return;
  const slots = getSkadisGrid(body, skadisRadius(body, radiusInput.valueAsNumber), readSkadisLayout().offset);
  const width = Math.max(240, body.width * 2);
  const height = Math.max(90, body.height * 2);
  const inner = document.createElement("div");
  inner.className = "skadis-picker-inner";
  inner.style.width = `${width}px`;
  inner.style.height = `${height}px`;
  for (const slot of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skadis-slot";
    button.dataset.column = slot.column;
    button.dataset.row = slot.row;
    button.style.left = `${(0.5 - slot.x / body.width) * 100}%`;
    button.style.top = `${(1 - slot.z / body.height) * 100}%`;
    button.setAttribute("aria-label", `Loch X ${slot.x} mm, Höhe ${slot.z} mm`);
    button.setAttribute("aria-pressed", String(isSkadisSelected(slot)));
    inner.appendChild(button);
  }
  skadisPicker.appendChild(inner);
  if (focused) {
    skadisPicker.querySelector(`[data-column="${focused.column}"][data-row="${focused.row}"]`)?.focus();
  }
  for (const selected of skadisSelection) {
    if (!slots.some((slot) => slot.column === selected.column && slot.row === selected.row)) {
      const button = document.createElement("button");
      button.className = "add-button";
      button.type = "button";
      button.textContent = `Nicht passende Position ${selected.column}, ${selected.row} entfernen`;
      button.addEventListener("click", () => toggleSkadisSlot(selected.column, selected.row));
      skadisInvalid.appendChild(button);
    }
  }

  if (!modelRoot || !scene) return;
  skadisOverlay = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(body.width, body.height),
    new THREE.MeshBasicMaterial({ color: "#b9d1c2", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  const boardZ = modelRoot.position.z - body.depth / 2 - getSkadisBoardOffset(body) - 0.2;
  board.position.set(modelRoot.position.x, modelRoot.position.y + body.height / 2, boardZ);
  skadisOverlay.add(board);
  const holeShape = new THREE.Shape();
  holeShape.moveTo(-2.5, -5);
  holeShape.absarc(0, -5, 2.5, Math.PI, 0, false);
  holeShape.lineTo(2.5, 5);
  holeShape.absarc(0, 5, 2.5, 0, Math.PI, false);
  holeShape.closePath();
  const holeGeometry = new THREE.ShapeGeometry(holeShape);
  const freeMaterial = new THREE.MeshBasicMaterial({ color: "#f6faf7", side: THREE.DoubleSide });
  const selectedMaterial = new THREE.MeshBasicMaterial({ color: "#16825e", side: THREE.DoubleSide });
  for (const slot of slots) {
    const hole = new THREE.Mesh(holeGeometry, isSkadisSelected(slot) ? selectedMaterial : freeMaterial);
    hole.position.set(modelRoot.position.x + slot.x, modelRoot.position.y + slot.z, boardZ - 0.1);
    hole.userData.skadisSlot = { column: slot.column, row: slot.row };
    skadisOverlay.add(hole);
  }
  if (separate && Number.isFinite(skadisBoardThickness.valueAsNumber)) {
    const hookMaterial = new THREE.MeshStandardMaterial({ color: "#b76c38", roughness: 0.6 });
    for (const slot of slots.filter(isSkadisSelected)) {
      const spec = getInsertSpec(body, Number(radiusInput.value), slot.x, slot.z, skadisBoardThickness.valueAsNumber);
      for (const piece of spec.pieces) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(piece.width, piece.height, piece.depth), hookMaterial);
        mesh.position.set(modelRoot.position.x + piece.x, modelRoot.position.y + piece.z + piece.height / 2,
          modelRoot.position.z - piece.y);
        skadisOverlay.add(mesh);
      }
    }
  }
  scene.add(skadisOverlay);
}

function renderGridfinityOverlay() {
  if (gridfinityOverlay) {
    scene.remove(gridfinityOverlay);
    gridfinityOverlay.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    gridfinityOverlay = undefined;
  }
  if (!gridfinityEnabled.checked || !modelRoot) return;
  let layout;
  try {
    layout = readGridfinityLayout(readBody());
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return;
  }
  const offset = gridfinityPlateOffset(layout);
  const width = layout.plateColumns * layout.pitch;
  const depth = layout.plateRows * layout.pitch;
  gridfinityOverlay = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: "#b9c9de", transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(modelRoot.position.x + offset.x, modelRoot.position.y - 0.1, modelRoot.position.z - offset.y);
  gridfinityOverlay.add(surface);
  const points = [];
  for (let column = 0; column <= layout.plateColumns; column += 1) {
    const x = -width / 2 + column * layout.pitch;
    points.push(x, 0, -depth / 2, x, 0, depth / 2);
  }
  for (let row = 0; row <= layout.plateRows; row += 1) {
    const z = -depth / 2 + row * layout.pitch;
    points.push(-width / 2, 0, z, width / 2, 0, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#496c8c" }));
  lines.position.copy(surface.position);
  lines.position.y += 0.03;
  gridfinityOverlay.add(lines);
  scene.add(gridfinityOverlay);
}

function validateParameters(body) {
  if (gridfinityEnabled.checked && gridfinityCountError) return gridfinityCountError;
  const dimensions = body.shape === "box" || body.shape === "container"
    ? [body.width, body.depth, body.height]
    : body.shape === "cylinder" || body.shape === "roundContainer"
      ? [body.width, body.height]
      : [body.width];
  if (!body.inputDimensionsValid || dimensions.some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) {
    return "Körpermaße müssen zwischen 0,1 und 1.000 mm liegen.";
  }
  if (body.isContainer) {
    if (![body.wall, body.base].every((value) => Number.isFinite(value) && value >= 0.5 && value <= 50)
      || body.width <= body.wall * 2 || body.depth <= body.wall * 2 || body.height <= body.base) {
      return "Wand- und Bodenstärke müssen in die Box passen und zwischen 0,5 und 50 mm liegen.";
    }
    const counts = [Number(compartmentsX.value), Number(compartmentsY.value)];
    if (body.shape === "container" && counts.some((value) => !Number.isInteger(value) || value < 1 || value > 10)) {
      return "Die Anzahl der Fächer muss zwischen 1 und 10 liegen.";
    }
    if (body.shape === "container") {
      const cellError = Object.values(cellInputErrors)[0];
      if (cellError) return cellError;
      try {
        readDividerHeight(body);
        readDividerLayout(body);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return error.message;
      }
    }
    if (lidEnabled.checked) {
      const thickness = Number(lidThickness.value);
      const clearance = Number(lidClearance.value);
      const insert = Number(lidInsertDepth.value);
      if (!Number.isFinite(thickness) || thickness < 0.5 || thickness > 20
        || !Number.isFinite(clearance) || clearance < 0 || clearance > 5
        || !Number.isFinite(insert) || insert < 0.5 || insert > 20
        || insert >= body.height - body.base
        || body.width - 2 * (body.wall + clearance) <= 0
        || body.depth - 2 * (body.wall + clearance) <= 0) {
        return "Deckelstärke, Spiel und Einstecktiefe müssen in die Box passen.";
      }
    }
  }

  const radius = radiusInput.valueAsNumber;
  const rectangular = body.shape === "box" || body.shape === "container";
  if (!Number.isFinite(radius) || radius < 0 || radius > (rectangular ? 1000 : 20)) {
    return `Der Kantenradius muss zwischen 0 und ${rectangular ? "1.000" : "20"} mm liegen.`;
  }
  const selection = activeEdges(body);
  if (radius > 0 && body.shape !== "sphere" && selection.length === 0) {
    return "Bitte mindestens eine Kante zum Abrunden auswählen oder den Radius auf 0 setzen.";
  }
  if (gridfinityEnabled.checked) {
    try {
      readGridfinityLayout(body);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return error.message;
    }
    if (radius > 0 && selection.some((id) => id.startsWith("bottom-"))) {
      return "Für Gridfinity bitte die unteren waagerechten Kanten abwählen oder den Radius auf 0 setzen.";
    }
    if (radius > 3.75 && getVerticalEdges(selection).length) {
      return "Für Gridfinity darf der Radius senkrechter Boxkanten höchstens 3,75 mm betragen, damit die Füße nicht überstehen.";
    }
  }
  const hasHorizontalEdge = selection.some((id) => !id.startsWith("vertical-"));
  if (radius > 0 && (!rectangular || hasHorizontalEdge)
    && radius >= Math.min(body.width, body.depth, body.height) / 2) {
    return "Der Kantenradius ist für diese Kantenauswahl zu groß.";
  }
  if (rectangular && !verticalRoundingFits(body, radius, [...selectedEdges])) {
    return "Der Radius ist für die gewählten senkrechten Kanten zu groß: Die Rundungen dürfen sich nicht überschneiden.";
  }
  if (body.shape === "container" && radius > body.wall
    && !verticalRoundingFits({ width: body.width - 2 * body.wall, depth: body.depth - 2 * body.wall },
      radius - body.wall, [...selectedEdges])) {
    return "Der Radius ist für die Innenform der Box zu groß. Bitte Radius, Wandstärke oder Boxmaße anpassen.";
  }
  if (body.isContainer && radius > 0 && (!rectangular || hasHorizontalEdge)
    && radius >= Math.min(body.wall, body.base)) {
    return "Waagerechte Boxkanten benötigen einen Radius kleiner als Wand- und Bodenstärke. Für große Rundungen nur senkrechte Kanten auswählen.";
  }
  if (body.shape === "container" && radius > body.wall && getVerticalEdges([...selectedEdges]).length) {
    const layout = readDividerLayout(body);
    for (const row of layout.rows) {
      for (const column of layout.columns) {
        if (polygonArea(getRoundedCellOutline(body, radius, [...selectedEdges], column, row)) < 0.01) {
          return "Ein Fach liegt vollständig außerhalb der gerundeten Innenfläche. Bitte Raster oder Radius anpassen.";
        }
      }
    }
  }

  if (body.isContainer) {
    for (const [index, cut] of containerCuts.entries()) {
      try {
        getCutSpec(body, cut);
        if (body.shape === "container" && !roundedCutFits(body, cut, radius, [...selectedEdges])) {
          return `Öffnung ${index + 1}: Die Öffnung liegt im gerundeten Bereich. Bitte Position oder Radius anpassen.`;
        }
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        return `Öffnung ${index + 1}: ${error.message}`;
      }
    }
  }
  if (skadisEnabled.checked) {
    try {
      getSkadisPlan(body, Number(skadisBoardThickness.value), skadisRadius(body, radius), body.isContainer ? containerCuts : [], readSkadisLayout());
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return error.message;
    }
  }

  for (const feature of body.isContainer ? [] : features) {
    const positionIsValid = [feature.x, feature.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 1000);
    if (!positionIsValid) {
      return "Positionen müssen gültige Werte zwischen −1.000 und 1.000 mm sein.";
    }
    if (feature.type === "hole") {
      if (!Number.isFinite(feature.diameter) || feature.diameter <= 0 || feature.diameter > 1000) {
        return "Der Bohrungsdurchmesser muss größer als 0 und höchstens 1.000 mm sein.";
      }
      if (feature.mode === "blind" && (!Number.isFinite(feature.depth) || feature.depth <= 0 || feature.depth > body.height)) {
        return "Die Sacklochtiefe muss größer als 0 sein und in den Körper passen.";
      }
      if (feature.mode === "countersink"
        && (!Number.isFinite(feature.counterDiameter) || feature.counterDiameter <= feature.diameter
          || !Number.isFinite(feature.counterDepth) || feature.counterDepth <= 0 || feature.counterDepth > body.height)) {
        return "Die Senkung braucht einen größeren Durchmesser als die Bohrung und eine gültige Tiefe.";
      }
    } else if (feature.type === "pocket") {
      if ([feature.width, feature.depth, feature.cutDepth].some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)
        || feature.cutDepth > body.height) {
        return "Taschenmaße müssen gültig sein und die Körperhöhe dürfen sie nicht überschreiten.";
      }
    } else if (feature.type === "bossCylinder") {
      if ([feature.diameter, feature.height].some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) {
        return "Die Maße eines Zusatz-Zylinders müssen größer als 0 und höchstens 1.000 mm sein.";
      }
    } else if ([feature.width, feature.depth, feature.height].some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) {
      return "Die Maße eines Zusatz-Quaders müssen größer als 0 und höchstens 1.000 mm sein.";
    }
  }
  if (!body.isContainer && skadisEnabled.checked) {
    const plan = getSkadisPlan(body, Number(skadisBoardThickness.value), skadisRadius(body, radius), [], readSkadisLayout());
    if (hasSkadisFeatureConflict(body, features, plan)) {
      return "Eine Bearbeitung überschneidet eine Skådis-Befestigung. Bitte Positionen anpassen.";
    }
  }
  return "";
}

function progressRange() {
  return new oc.Message_ProgressRange_1();
}

function buildBase(body) {
  if (body.shape === "box" || body.shape === "container") {
    const origin = new oc.gp_Pnt_3(-body.width / 2, -body.depth / 2, 0);
    const builder = new oc.BRepPrimAPI_MakeBox_3(origin, body.width, body.depth, body.height);
    const shape = builder.Shape();
    builder.delete();
    origin.delete();
    return shape;
  }
  if (body.shape === "cylinder" || body.shape === "roundContainer") {
    const point = new oc.gp_Pnt_3(0, 0, 0);
    const direction = new oc.gp_Dir_4(0, 0, 1);
    const axis = new oc.gp_Ax2_3(point, direction);
    const builder = new oc.BRepPrimAPI_MakeCylinder_3(axis, body.width / 2, body.height);
    const shape = builder.Shape();
    builder.delete();
    axis.delete();
    direction.delete();
    point.delete();
    return shape;
  }
  const center = new oc.gp_Pnt_3(0, 0, body.height / 2);
  const builder = new oc.BRepPrimAPI_MakeSphere_5(center, body.width / 2);
  const shape = builder.Shape();
  builder.delete();
  center.delete();
  return shape;
}

function cylinderShape(x, y, z, radius, height, vector = [0, 0, 1]) {
  const point = new oc.gp_Pnt_3(x, y, z);
  const direction = new oc.gp_Dir_4(...vector);
  const axis = new oc.gp_Ax2_3(point, direction);
  const builder = new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height);
  const shape = builder.Shape();
  builder.delete();
  axis.delete();
  direction.delete();
  point.delete();
  return shape;
}

function makeContainerCut(body, cut) {
  const spec = getCutSpec(body, cut);
  const [x, y, originalZ] = spec.center;
  const [width, height, originalDepth] = spec.size;
  const extension = gridfinityEnabled.checked && cut.face === "bottom" ? GRIDFINITY_FOOT_HEIGHT : 0;
  const z = originalZ - extension;
  const depth = originalDepth + extension;
  if (cut.type === "circle") {
    return cylinderShape(x, y, z, width / 2, depth, spec.direction);
  }
  if (spec.axis === "z") {
    return boxShape(x, y, z, width, height, depth);
  }
  if (spec.axis === "y") {
    return boxShape(x, y + depth / 2, z - height / 2, width, depth, height);
  }
  return boxShape(x + depth / 2, y, z - height / 2, depth, width, height);
}

function gridfinitySection(x, y, section) {
  const { width, radius, z } = section;
  const half = width / 2;
  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  const direction = new oc.gp_Dir_4(0, 0, 1);
  try {
    const corners = [
      [x + half - radius, y - half + radius, -Math.PI / 2],
      [x + half - radius, y + half - radius, 0],
      [x - half + radius, y + half - radius, Math.PI / 2],
      [x - half + radius, y - half + radius, Math.PI]
    ];
    for (let i = 0; i < corners.length; i += 1) {
      const [cx, cy, angle] = corners[i];
      const [nx, ny, nextAngle] = corners[(i + 1) % corners.length];
      const center = new oc.gp_Pnt_3(cx, cy, z);
      const axis = new oc.gp_Ax2_3(center, direction);
      const circle = new oc.gp_Circ_2(axis, radius);
      const arc = new oc.BRepBuilderAPI_MakeEdge_9(circle, angle, angle + Math.PI / 2);
      const end = new oc.gp_Pnt_3(cx + radius * Math.cos(angle + Math.PI / 2), cy + radius * Math.sin(angle + Math.PI / 2), z);
      const next = new oc.gp_Pnt_3(nx + radius * Math.cos(nextAngle), ny + radius * Math.sin(nextAngle), z);
      const line = new oc.BRepBuilderAPI_MakeEdge_3(end, next);
      const arcEdge = arc.Edge();
      const lineEdge = line.Edge();
      wireBuilder.Add_1(arcEdge);
      wireBuilder.Add_1(lineEdge);
      arcEdge.delete();
      lineEdge.delete();
      arc.delete();
      line.delete();
      circle.delete();
      axis.delete();
      center.delete();
      end.delete();
      next.delete();
    }
    if (!wireBuilder.IsDone()) throw new Error("Gridfinity-Profil konnte nicht erstellt werden.");
    return wireBuilder.Wire();
  } finally {
    direction.delete();
    wireBuilder.delete();
  }
}

function gridfinityProfileShape(x, y, sections) {
  const loft = new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6);
  const range = progressRange();
  try {
    for (const section of sections) {
      const wire = gridfinitySection(x, y, section);
      loft.AddWire(wire);
      wire.delete();
    }
    loft.Build(range);
    if (!loft.IsDone()) throw new Error("Gridfinity-Profil konnte nicht aufgebaut werden.");
    return loft.Shape();
  } finally {
    range.delete();
    loft.delete();
  }
}

function addGridfinityFeet(shape, layout) {
  let result = shape;
  try {
    for (let row = 0; row < layout.rows; row += 1) {
      for (let column = 0; column < layout.columns; column += 1) {
        const x = (column - (layout.columns - 1) / 2) * layout.pitch;
        const y = (row - (layout.rows - 1) / 2) * layout.pitch;
        const foot = gridfinityProfileShape(x, y, gridfinityFootProfile(layout.pitch));
        try {
          const next = booleanOperation(result, foot, "fuse");
          if (result !== shape) result.delete();
          result = next;
        } finally {
          foot.delete();
        }
      }
    }
    return result;
  } catch (error) {
    if (result !== shape) result.delete();
    throw error;
  }
}

function buildGridfinityPlate(layout) {
  let plate = boxShape(0, 0, 0, layout.plateColumns * layout.pitch, layout.plateRows * layout.pitch, 5);
  try {
    for (let row = 0; row < layout.plateRows; row += 1) {
      for (let column = 0; column < layout.plateColumns; column += 1) {
        const x = (column - (layout.plateColumns - 1) / 2) * layout.pitch;
        const y = (row - (layout.plateRows - 1) / 2) * layout.pitch;
        const socket = gridfinityProfileShape(x, y, gridfinitySocketProfile(layout.pitch));
        try {
          const next = booleanOperation(plate, socket, "cut");
          plate.delete();
          plate = next;
        } finally {
          socket.delete();
        }
      }
    }
    return plate;
  } catch (error) {
    plate.delete();
    throw error;
  }
}

function boxShape(x, y, z, width, depth, height) {
  const origin = new oc.gp_Pnt_3(x - width / 2, y - depth / 2, z);
  const builder = new oc.BRepPrimAPI_MakeBox_3(origin, width, depth, height);
  const shape = builder.Shape();
  builder.delete();
  origin.delete();
  return shape;
}

function coneShape(x, y, z, bottomRadius, topRadius, height) {
  const point = new oc.gp_Pnt_3(x, y, z);
  const direction = new oc.gp_Dir_4(0, 0, 1);
  const axis = new oc.gp_Ax2_3(point, direction);
  const builder = new oc.BRepPrimAPI_MakeCone_3(axis, bottomRadius, topRadius, height);
  const shape = builder.Shape();
  builder.delete();
  axis.delete();
  direction.delete();
  point.delete();
  return shape;
}

function booleanOperation(base, tool, operationName) {
  const range = progressRange();
  const operation = operationName === "cut"
    ? new oc.BRepAlgoAPI_Cut_3(base, tool, range)
    : operationName === "common"
      ? new oc.BRepAlgoAPI_Common_3(base, tool, range)
      : new oc.BRepAlgoAPI_Fuse_3(base, tool, range);
  try {
    operation.Build(range);
    if (!operation.IsDone()) {
      throw new Error("Die Geometrieoperation konnte nicht abgeschlossen werden.");
    }
    return operation.Shape();
  } finally {
    operation.delete();
    range.delete();
  }
}

function applyFeature(shape, feature, body) {
  if (feature.type === "bossCylinder") {
    const tool = cylinderShape(feature.x, feature.y, body.height - 0.05, feature.diameter / 2, feature.height + 0.05);
    try {
      return booleanOperation(shape, tool, "fuse");
    } finally {
      tool.delete();
    }
  }
  if (feature.type === "bossBox") {
    const tool = boxShape(feature.x, feature.y, body.height - 0.05, feature.width, feature.depth, feature.height + 0.05);
    try {
      return booleanOperation(shape, tool, "fuse");
    } finally {
      tool.delete();
    }
  }

  if (feature.type === "pocket") {
    const tool = boxShape(feature.x, feature.y, body.height - feature.cutDepth, feature.width, feature.depth, feature.cutDepth + 0.02);
    try {
      return booleanOperation(shape, tool, "cut");
    } finally {
      tool.delete();
    }
  }

  const drillStart = feature.mode === "blind" ? body.height - feature.depth : -0.02;
  const drillHeight = feature.mode === "blind" ? feature.depth + 0.02 : body.height + 0.04;
  const drill = cylinderShape(feature.x, feature.y, drillStart, feature.diameter / 2, drillHeight);
  let nextShape;
  try {
    nextShape = booleanOperation(shape, drill, "cut");
  } finally {
    drill.delete();
  }

  if (feature.mode !== "countersink") {
    return nextShape;
  }
  const cone = coneShape(
    feature.x,
    feature.y,
    body.height - feature.counterDepth,
    feature.diameter / 2,
    feature.counterDiameter / 2,
    feature.counterDepth + 0.01
  );
  try {
    const countersunkShape = booleanOperation(nextShape, cone, "cut");
    nextShape.delete();
    return countersunkShape;
  } finally {
    cone.delete();
  }
}

function applyFillet(shape, radius) {
  if (radius === 0) {
    return { shape, applied: 0, skipped: 0 };
  }
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const edges = [];
  try {
    while (explorer.More()) {
      const edgeShape = explorer.Current();
      edges.push(oc.TopoDS.Edge_1(edgeShape));
      edgeShape.delete();
      explorer.Next();
    }
  } finally {
    explorer.delete();
  }
  if (edges.length === 0) {
    throw new Error("Für diesen Körper gibt es keine abrundbaren Kanten.");
  }

  const allEdgesFillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  let allEdgesResult;
  try {
    for (const edge of edges) {
      allEdgesFillet.Add_2(radius, edge);
    }
    const range = progressRange();
    try {
      allEdgesFillet.Build(range);
      if (allEdgesFillet.IsDone()) {
        allEdgesResult = allEdgesFillet.Shape();
      }
    } finally {
      range.delete();
    }
  } catch {
    allEdgesResult = undefined;
  } finally {
    allEdgesFillet.delete();
  }
  if (allEdgesResult) {
    edges.forEach((edge) => edge.delete());
    return { shape: allEdgesResult, applied: edges.length, skipped: 0 };
  }

  let result = shape;
  let applied = 0;
  for (const edge of edges) {
    const fillet = new oc.BRepFilletAPI_MakeFillet(result, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    try {
      fillet.Add_2(radius, edge);
      const range = progressRange();
      try {
        fillet.Build(range);
        if (fillet.IsDone()) {
          const nextResult = fillet.Shape();
          if (result !== shape) {
            result.delete();
          }
          result = nextResult;
          applied += 1;
        }
      } finally {
        range.delete();
      }
    } catch {
      // Some edges cannot be rounded at the requested radius.
    } finally {
      fillet.delete();
      edge.delete();
    }
  }
  if (applied === 0) {
    if (result !== shape) {
      result.delete();
    }
    throw new Error("Dieser Radius ist an keiner Modellkante möglich.");
  }
  return { shape: result, applied, skipped: edges.length - applied };
}

function applyBoxFillet(shape, body, radius, selection, bottom = 0) {
  if (radius === 0 || selection.length === 0) return shape;
  const vertical = getVerticalEdges(selection);
  const tangent = vertical.length === selection.length && (
    (Math.abs(radius * 2 - body.width) < 1e-7 && ["front", "back"].some((side) =>
      vertical.includes(`vertical-${side}-left`) && vertical.includes(`vertical-${side}-right`)))
    || (Math.abs(radius * 2 - body.depth) < 1e-7 && ["left", "right"].some((side) =>
      vertical.includes(`vertical-front-${side}`) && vertical.includes(`vertical-back-${side}`))));
  if (tangent) return applyTangentBoxFillet(shape, body, radius, vertical, bottom);
  const descriptions = getBoxEdges(body, bottom).filter((edge) => selection.includes(edge.id));
  const found = new Map();
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    while (explorer.More()) {
      const current = explorer.Current();
      const edge = oc.TopoDS.Edge_1(current);
      current.delete();
      try {
        const first = oc.TopExp.FirstVertex(edge, true);
        const last = oc.TopExp.LastVertex(edge, true);
        try {
          const a = oc.BRep_Tool.Pnt(first);
          const b = oc.BRep_Tool.Pnt(last);
          try {
            const description = descriptions.find((item) => matchesBoxEdge(item, [a.X(), a.Y(), a.Z()], [b.X(), b.Y(), b.Z()]));
            if (description && !found.has(description.id)) {
              found.set(description.id, edge);
            } else {
              edge.delete();
            }
          } finally {
            a.delete();
            b.delete();
          }
        } finally {
          first.delete();
          last.delete();
        }
      } catch (error) {
        if (![...found.values()].includes(edge)) edge.delete();
        throw error;
      }
      explorer.Next();
    }
    if (found.size !== descriptions.length) throw new Error("Die gewählten Kanten konnten nicht gefunden werden.");
    const builder = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    try {
      for (const edge of found.values()) builder.Add_2(radius, edge);
      const range = progressRange();
      try {
        builder.Build(range);
        if (!builder.IsDone()) throw new Error("Die gewählten Kanten lassen sich mit diesem Radius nicht gemeinsam abrunden.");
        return builder.Shape();
      } finally {
        range.delete();
      }
    } finally {
      builder.delete();
    }
  } finally {
    explorer.delete();
    for (const edge of found.values()) edge.delete();
  }
}

function applyCircularFillet(shape, body, radius, selection) {
  if (radius === 0 || !selection.length) return shape;
  const found = new Map();
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    while (explorer.More()) {
      const current = explorer.Current();
      const edge = oc.TopoDS.Edge_1(current);
      current.delete();
      let retained = false;
      try {
        const first = oc.TopExp.FirstVertex(edge, true);
        const last = oc.TopExp.LastVertex(edge, true);
        try {
          const a = oc.BRep_Tool.Pnt(first);
          const b = oc.BRep_Tool.Pnt(last);
          try {
            if (Math.abs(a.Z() - b.Z()) < 1e-5) {
              const id = Math.abs(a.Z()) < 1e-5 ? "ring-bottom"
                : Math.abs(a.Z() - body.height) < 1e-5 ? "ring-top" : "";
              if (selection.includes(id) && !found.has(id)) {
                found.set(id, edge);
                retained = true;
              }
            }
          } finally {
            a.delete();
            b.delete();
          }
        } finally {
          first.delete();
          last.delete();
        }
      } finally {
        if (!retained) edge.delete();
      }
      explorer.Next();
    }
    if (found.size !== selection.length) throw new Error("Die gewählten Kreisränder konnten nicht gefunden werden.");
    const builder = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    try {
      for (const edge of found.values()) builder.Add_2(radius, edge);
      const range = progressRange();
      try {
        builder.Build(range);
        if (!builder.IsDone()) throw new Error("Die gewählten Kreisränder lassen sich mit diesem Radius nicht gemeinsam abrunden.");
        return builder.Shape();
      } finally {
        range.delete();
      }
    } finally {
      builder.delete();
    }
  } finally {
    explorer.delete();
    for (const edge of found.values()) edge.delete();
  }
}

function applyTangentBoxFillet(shape, body, radius, selection, bottom) {
  let result = shape;
  try {
    for (const id of selection) {
      const front = id.includes("-front-");
      const left = id.endsWith("-left");
      const x = (left ? -1 : 1) * (body.width / 2 - radius);
      const y = (front ? -1 : 1) * (body.depth / 2 - radius);
      const square = boxShape((left ? -1 : 1) * (body.width - radius) / 2,
        (front ? -1 : 1) * (body.depth - radius) / 2, bottom - 0.02, radius, radius, body.height + 0.04);
      const cylinder = cylinderShape(x, y, bottom - 0.03, radius, body.height + 0.06);
      try {
        const corner = booleanOperation(square, cylinder, "cut");
        try {
          const next = booleanOperation(result, corner, "cut");
          if (result !== shape) result.delete();
          result = next;
        } finally {
          corner.delete();
        }
      } finally {
        square.delete();
        cylinder.delete();
      }
    }
    return result;
  } catch (error) {
    if (result !== shape) result.delete();
    throw error;
  }
}

function roundedBoxShape(width, depth, height, bottom, radius, edges) {
  const shape = boxShape(0, 0, bottom, width, depth, height);
  if (radius <= 0 || edges.length === 0) return shape;
  try {
    return applyBoxFillet(shape, { width, depth, height }, radius, edges, bottom);
  } finally {
    shape.delete();
  }
}

function buildModel(parameters) {
  let shape = buildBase(parameters.body);
  try {
    const rectangular = parameters.body.shape === "box" || parameters.body.shape === "container";
    const selection = activeEdges(parameters.body);
    const filletResult = rectangular
      ? { shape: applyBoxFillet(shape, parameters.body, parameters.radius, selection), applied: selection.length, skipped: 0 }
      : parameters.body.shape === "sphere"
        ? applyFillet(shape, parameters.radius)
        : { shape: applyCircularFillet(shape, parameters.body, parameters.radius, selection), applied: selection.length, skipped: 0 };
    if (filletResult.shape !== shape) {
      shape.delete();
      shape = filletResult.shape;
    }
    if (parameters.body.isContainer) {
      const body = parameters.body;
      const verticalEdges = getVerticalEdges([...selectedEdges]);
      const innerRadius = Math.max(0, parameters.radius - body.wall);
      const tool = body.shape === "container"
        ? roundedBoxShape(body.width - 2 * body.wall, body.depth - 2 * body.wall, body.height - body.base + 0.02,
          body.base, innerRadius, verticalEdges)
        : cylinderShape(0, 0, body.base, body.width / 2 - body.wall, body.height - body.base + 0.02);
      let hollow;
      try {
        hollow = booleanOperation(shape, tool, "cut");
      } finally {
        tool.delete();
      }
      shape.delete();
      shape = hollow;

      if (body.shape === "container") {
        for (const segment of readDividerLayout(body).segments) {
          const center = (segment.start + segment.end) / 2;
          const span = segment.end - segment.start + 0.02;
          let divider = segment.axis === "x"
            ? boxShape(segment.position, center, body.base - 0.01, body.wall, span, segment.height + 0.01)
            : boxShape(center, segment.position, body.base - 0.01, span, body.wall, segment.height + 0.01);
          try {
            if (innerRadius > 0 && verticalEdges.length) {
              const boundary = roundedBoxShape(body.width - 2 * body.wall + 0.04, body.depth - 2 * body.wall + 0.04,
                body.height - body.base + 0.04, body.base - 0.02, innerRadius + 0.02, verticalEdges);
              try {
                const clipped = booleanOperation(divider, boundary, "common");
                divider.delete();
                divider = clipped;
                const solids = new oc.TopExp_Explorer_2(divider, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
                try {
                  if (!solids.More()) throw new Error("Ein Trennwandabschnitt liegt außerhalb der gerundeten Box. Bitte Raster oder Radius anpassen.");
                } finally {
                  solids.delete();
                }
              } finally {
                boundary.delete();
              }
            }
            const next = booleanOperation(shape, divider, "fuse");
            shape.delete();
            shape = next;
          } finally {
            divider.delete();
          }
        }
      }
      if (gridfinityEnabled.checked) {
        const withFeet = addGridfinityFeet(shape, readGridfinityLayout(body));
        shape.delete();
        shape = withFeet;
      }
      for (const cut of containerCuts) {
        const cutter = makeContainerCut(body, cut);
        try {
          const next = booleanOperation(shape, cutter, "cut");
          shape.delete();
          shape = next;
        } finally {
          cutter.delete();
        }
      }
    }
    for (const feature of (parameters.body.isContainer ? [] : features.filter((item) => item.type.startsWith("boss")))) {
      const next = applyFeature(shape, feature, parameters.body);
      shape.delete();
      shape = next;
    }
    for (const feature of (parameters.body.isContainer ? [] : features.filter((item) => !item.type.startsWith("boss")))) {
      const next = applyFeature(shape, feature, parameters.body);
      shape.delete();
      shape = next;
    }
    if (skadisEnabled.checked) {
      const body = parameters.body;
      const plan = getSkadisPlan(body, Number(skadisBoardThickness.value), skadisRadius(body, parameters.radius),
        body.isContainer ? containerCuts : [], readSkadisLayout());
      const separate = ["roundContainer", "cylinder", "sphere"].includes(body.shape);
      const operations = separate
        ? plan.inserts.flatMap((insert) => [insert.slot, ...(insert.undercut ? [insert.undercut] : [])])
        : plan.hooks.flatMap((hook) => [hook.shelf, hook.tail]);
      for (const part of operations) {
        const tool = boxShape(part.x, part.y, part.z, part.width, part.depth, part.height);
        try {
          const next = booleanOperation(shape, tool, separate ? "cut" : "fuse");
          shape.delete();
          shape = next;
        } finally {
          tool.delete();
        }
      }
    }
    return { shape, fillet: filletResult };
  } catch (error) {
    shape.delete();
    throw error;
  }
}

function buildLid(body) {
  const thickness = Number(lidThickness.value);
  const clearance = Number(lidClearance.value);
  const insertDepth = Number(lidInsertDepth.value);
  const innerWidth = body.width - 2 * (body.wall + clearance);
  const innerDepth = body.depth - 2 * (body.wall + clearance);
  const radius = radiusInput.valueAsNumber;
  const verticalEdges = getVerticalEdges([...selectedEdges]);
  const plate = body.shape === "container"
    ? roundedBoxShape(body.width, body.depth, thickness, 0, radius, verticalEdges)
    : cylinderShape(0, 0, 0, body.width / 2, thickness);
  let insert;
  let lid;
  try {
    insert = body.shape === "container"
      ? roundedBoxShape(innerWidth, innerDepth, insertDepth + 0.01, thickness - 0.01,
        Math.max(0, radius - body.wall - clearance), verticalEdges)
      : cylinderShape(0, 0, thickness - 0.01, innerWidth / 2, insertDepth + 0.01);
    lid = booleanOperation(plate, insert, "fuse");
  } finally {
    plate.delete();
    if (insert) insert.delete();
  }
  try {
    if (body.shape === "container") {
      for (const segment of readDividerLayout(body).segments) {
        const notchDepth = getLidDividerNotchDepth(body, segment.height, insertDepth, clearance);
        if (notchDepth === 0) continue;
        const notchStart = thickness + insertDepth - notchDepth;
        const center = (segment.start + segment.end) / 2;
        const span = segment.end - segment.start + 2 * clearance + 0.02;
        const channel = segment.axis === "x"
          ? boxShape(segment.position, center, notchStart, body.wall + 2 * clearance, span, notchDepth + 0.02)
          : boxShape(center, segment.position, notchStart, span, body.wall + 2 * clearance, notchDepth + 0.02);
        try {
          const next = booleanOperation(lid, channel, "cut");
          lid.delete();
          lid = next;
        } finally {
          channel.delete();
        }
      }
    }
    return lid;
  } catch (error) {
    lid.delete();
    throw error;
  }
}

function shapeToGlbUrl(shape) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  const docHandle = new oc.Handle_TDocStd_Document_2(doc);
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(docHandle.get().Main()).get();
  shapeTool.SetShape(shapeTool.NewShape(), shape);
  const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, 0.15, false, 0.25, false);
  mesh.delete();
  const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2("./preview.glb"), true);
  const range = progressRange();
  try {
    writer.Perform_2(docHandle, new oc.TColStd_IndexedDataMapOfStringString_1(), range);
    const file = oc.FS.readFile("./preview.glb", { encoding: "binary" });
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    return URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" }));
  } finally {
    range.delete();
    writer.delete();
    docHandle.delete();
  }
}

function setupViewport() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#f8faf8");
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
  camera.up.set(0, 1, 0);
  camera.position.set(105, 85, 125);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  scene.add(new THREE.HemisphereLight("#ffffff", "#d9e3dd", 2.1));
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.6);
  keyLight.position.set(100, 150, 100);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight("#e0f2e9", 1.1);
  fillLight.position.set(-80, 60, -100);
  scene.add(fillLight);
  const grid = new THREE.GridHelper(180, 18, "#c8d6ce", "#e3eae5");
  grid.position.y = -0.01;
  scene.add(grid);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 10, 0);
  lastCameraPosition = camera.position.clone();

  const resizeObserver = new ResizeObserver(() => {
    const bounds = viewportWrap.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(viewportWrap);

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

function frameModel(model, preserveView = false) {
  model.rotation.x = -Math.PI / 2;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  model.updateMatrixWorld(true);
  const framedBounds = new THREE.Box3().setFromObject(model);
  const size = framedBounds.getSize(new THREE.Vector3());
  if (preserveView) return;
  const maxDimension = Math.max(size.x, size.y, size.z);
  const distance = Math.max(maxDimension * 2.5, 65);
  controls.target.set(0, size.y / 2, 0);
  camera.position.set(distance * 0.85, distance * 1.3, distance);
  camera.near = Math.max(distance / 1000, 0.1);
  camera.far = Math.max(distance * 100, 1000);
  camera.updateProjectionMatrix();
  controls.update();
  lastCameraPosition.copy(camera.position);
}

function showModel(shape) {
  const version = ++modelVersion;
  const url = shapeToGlbUrl(shape);
  const loader = new GLTFLoader();
  loader.load(url, (gltf) => {
    if (version !== modelVersion) {
      URL.revokeObjectURL(url);
      return;
    }
    if (currentModelUrl) {
      URL.revokeObjectURL(currentModelUrl);
    }
    currentModelUrl = url;
    const preserveView = Boolean(modelRoot && (skadisEnabled.checked || gridfinityEnabled.checked || selectedCell || edgeMode.getAttribute("aria-pressed") === "true"));
    if (modelRoot) {
      scene.remove(modelRoot);
      modelRoot.traverse((object) => {
        if (object.isMesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    }
    modelRoot = gltf.scene;
    modelRoot.traverse((object) => {
      if (object.isMesh) {
        object.material = new THREE.MeshStandardMaterial({
          color: "#78b89a",
          roughness: 0.55,
          metalness: 0.04,
          side: THREE.DoubleSide
        });
      }
    });
    scene.add(modelRoot);
    frameModel(modelRoot, preserveView);
    renderSkadisPicker();
    refreshCellControls(readBody());
    renderCellOverlay(readBody());
    renderEdgeOverlay();
    renderGridfinityOverlay();
    placeholder.hidden = true;
    exportButton.disabled = false;
    exportLidButton.disabled = !currentLid;
    exportSkadisHookButton.disabled = skadisExportOptions.hidden;
    exportGridfinityButton.disabled = !gridfinityEnabled.checked;
  }, undefined, (error) => {
    URL.revokeObjectURL(url);
    if (version !== modelVersion) {
      return;
    }
    setStatus(`Die 3D-Vorschau konnte nicht geladen werden: ${error.message}`, "error");
    exportButton.disabled = true;
    exportLidButton.disabled = true;
    exportSkadisHookButton.disabled = true;
    exportGridfinityButton.disabled = true;
  });
}

function updateModel() {
  const body = readBody();
  const parameters = { body, radius: Number(radiusInput.value) };
  const validationMessage = validateParameters(body);
  exportLidButton.disabled = true;
  exportSkadisHookButton.disabled = true;
  exportGridfinityButton.disabled = true;
  if (validationMessage) {
    buildFailed = true;
    exportButton.disabled = true;
    setStatus(validationMessage, "error");
    return;
  }
  setStatus("Berechne 3D-Körper …");
  exportButton.disabled = true;
  try {
    const nextModel = buildModel(parameters);
    let nextLid;
    try {
      nextLid = body.isContainer && lidEnabled.checked ? buildLid(body) : undefined;
      if (nextLid) {
        const lidMesh = new oc.BRepMesh_IncrementalMesh_2(nextLid, 0.15, false, 0.25, false);
        lidMesh.delete();
      }
    } catch (error) {
      if (nextLid) {
        nextLid.delete();
      }
      nextModel.shape.delete();
      throw error;
    }
    if (currentShape) {
      currentShape.delete();
    }
    if (currentLid) {
      currentLid.delete();
    }
    currentShape = nextModel.shape;
    currentLid = nextLid;
    buildFailed = false;
    const dimensions = body.shape === "box" || body.shape === "container"
      ? `${body.width} × ${body.depth} × ${body.height} mm`
      : body.shape === "cylinder" || body.shape === "roundContainer"
        ? `Ø ${body.width} × ${body.height} mm`
        : `Ø ${body.width} mm`;
    if (body.isContainer) {
      const innerWidth = body.width - 2 * body.wall;
      const innerDepth = body.depth - 2 * body.wall;
      const innerHeight = body.height - body.base;
      containerMeasures.textContent = body.shape === "container"
        ? `Innen: ${innerWidth.toFixed(2)} × ${innerDepth.toFixed(2)} × ${innerHeight.toFixed(2)} mm · Außen: ${dimensions}`
        : `Innen: Ø ${innerWidth.toFixed(2)} × ${innerHeight.toFixed(2)} mm · Außen: ${dimensions}`;
    }
    modelInfo.textContent = body.isContainer
      ? `${shapeLabels[body.shape]} · Außen${skadisEnabled.checked ? " ohne Haken" : ""}: ${dimensions}${gridfinityEnabled.checked ? " · Füße zusätzlich 4,75 mm" : ""}`
      : `${shapeLabels[body.shape]} · ${features.length} Geometrie${features.length === 1 ? "" : "n"} · ${dimensions}`;
    showModel(currentShape);
    const roundingStatus = nextModel.fillet.skipped > 0
      ? `Rundung an ${nextModel.fillet.applied} von ${nextModel.fillet.applied + nextModel.fillet.skipped} Kanten angewendet; ${nextModel.fillet.skipped} nicht möglich.`
      : "Modell bereit – du kannst die Ansicht drehen oder als STL exportieren.";
    setStatus(roundingStatus, nextModel.fillet.skipped > 0 ? "" : "success");
  } catch (error) {
    buildFailed = true;
    exportButton.disabled = true;
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`Modell konnte nicht erstellt werden. Prüfe Maße und Kantenradius. ${detail}`, "error");
  }
}

function scheduleUpdate() {
  renderSkadisPicker();
  modelVersion += 1;
  exportButton.disabled = true;
  exportLidButton.disabled = true;
  exportSkadisHookButton.disabled = true;
  exportGridfinityButton.disabled = true;
  renderGridfinityOverlay();
  if (!oc) {
    return;
  }
  setStatus("Änderung wird berechnet; die Vorschau zeigt möglicherweise noch den vorherigen Stand.");
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(updateModel, 220);
}

function addFeature(type) {
  const defaults = {
    hole: { type, mode: "through", diameter: 5, x: 0, y: 0, depth: 5, counterDiameter: 9, counterDepth: 2 },
    pocket: { type, width: 12, depth: 10, x: 0, y: 0, cutDepth: 4 },
    bossCylinder: { type, diameter: 12, height: 8, x: 0, y: 0 },
    bossBox: { type, width: 12, depth: 10, height: 8, x: 0, y: 0 }
  };
  features.push({ ...defaults[type], id: nextFeatureId++ });
  renderFeatures();
  scheduleUpdate();
}

function addContainerCut(type) {
  containerCuts.push({
    id: nextCutId++,
    type,
    face: "bottom",
    u: 0,
    v: 0,
    diameter: 5,
    width: 10,
    height: 5
  });
  renderCuts();
  scheduleUpdate();
}

function exportStl(shape, name) {
  if (!shape || buildFailed || !oc) {
    setStatus("STL-Export nicht möglich: Bitte zuerst ein gültiges Modell berechnen.", "error");
    return;
  }
  try {
    const fileName = `./${name}.stl`;
    const writer = new oc.StlAPI_Writer();
    const range = progressRange();
    try {
      const written = writer.Write(shape, fileName, range);
      if (!written) {
        throw new Error("Der STL-Writer konnte keine Datei erzeugen.");
      }
    } finally {
      writer.delete();
      range.delete();
    }
    const bytes = oc.FS.readFile(fileName, { encoding: "binary" });
    if (bytes.byteLength < 84) {
      throw new Error("Die STL-Datei ist leer oder unvollständig.");
    }
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.stl`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("STL-Datei wurde lokal heruntergeladen.", "success");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`STL-Export fehlgeschlagen: ${detail}`, "error");
  }
}

function exportSkadisHook() {
  if (exportSkadisHookButton.disabled || buildFailed) return;
  let hook;
  try {
    const body = readBody();
    const plan = getSkadisPlan(body, skadisBoardThickness.valueAsNumber, skadisRadius(body, radiusInput.valueAsNumber),
      body.isContainer ? containerCuts : [], readSkadisLayout());
    const index = skadisSelection.findIndex((slot) => `${slot.column},${slot.row}` === skadisExportSelect.value);
    const insert = plan.inserts[index];
    if (!insert) throw new Error("Der ausgewählte Haken ist nicht verfügbar.");
    const minZ = Math.min(...insert.pieces.map((piece) => piece.z));
    const minY = Math.min(...insert.pieces.map((piece) => piece.y - piece.depth / 2));
    for (const piece of insert.pieces) {
      const part = boxShape(piece.z - minZ + piece.height / 2, piece.y - minY, 0,
        piece.height, piece.depth, piece.width);
      if (!hook) {
        hook = part;
      } else {
        try {
          const next = booleanOperation(hook, part, "fuse");
          hook.delete();
          hook = next;
        } finally {
          part.delete();
        }
      }
    }
    const mesh = new oc.BRepMesh_IncrementalMesh_2(hook, 0.15, false, 0.25, false);
    mesh.delete();
    exportStl(hook, `skadis-haken-${index + 1}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`Haken konnte nicht erstellt werden: ${detail}`, "error");
  } finally {
    if (hook) hook.delete();
  }
}

function resetCamera(topView = false) {
  if (topView) {
    const distance = camera.position.distanceTo(controls.target);
    camera.position.set(0, controls.target.y + distance, 0.01);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.copy(lastCameraPosition);
  }
  camera.lookAt(controls.target);
  controls.update();
}

function showSkadisBack() {
  const body = readBody();
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const distance = Math.max(body.height / Math.tan(halfFov), body.width / (camera.aspect * Math.tan(halfFov))) * 0.65;
  camera.up.set(0, 1, 0);
  camera.position.set(controls.target.x, controls.target.y, controls.target.z - Math.max(distance, 65));
  camera.lookAt(controls.target);
  controls.update();
}

bodyShape.addEventListener("change", () => {
  renderBodyFields();
  snapGridfinityBody();
  renderEdgeList();
  renderEdgeOverlay();
  scheduleUpdate();
});
bodyFields.addEventListener("change", (event) => {
  if (["width", "depth"].includes(event.target.dataset.bodyProp) || !gridfinityResizePending) snapGridfinityBody();
  scheduleUpdate();
});
bodyFields.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.bodyProp) {
    initialBody[input.dataset.bodyProp] = Number(input.value);
  }
  scheduleUpdate();
});
radiusInput.addEventListener("input", scheduleUpdate);
edgeMode.addEventListener("click", () => {
  const active = edgeMode.getAttribute("aria-pressed") !== "true";
  edgeMode.setAttribute("aria-pressed", String(active));
  if (active) {
    skadisMove.setAttribute("aria-pressed", "false");
    gridfinityMove.setAttribute("aria-pressed", "false");
  }
  renderEdgeOverlay();
});
edgeList.addEventListener("change", (event) => {
  const input = event.target;
  if (!input.dataset.edgeId) return;
  const id = input.dataset.edgeId;
  updateEdgeSelection(id, input.checked);
  edgeList.querySelector(`[data-edge-id="${id}"]`).focus();
});
document.querySelector("#edges-all").addEventListener("click", () => {
  for (const edge of selectableEdges(readBody())) selectedEdges.add(edge.id);
  renderEdgeList();
  renderEdgeOverlay();
  scheduleUpdate();
});
document.querySelector("#edges-none").addEventListener("click", () => {
  for (const edge of selectableEdges(readBody())) selectedEdges.delete(edge.id);
  renderEdgeList();
  renderEdgeOverlay();
  scheduleUpdate();
});
[measureMode, wallInput, baseInput, lidThickness, lidClearance, lidInsertDepth].forEach((input) => {
  input.addEventListener("input", scheduleUpdate);
  input.addEventListener("change", () => {
    if (input === measureMode || input === wallInput) {
      if (gridfinityEnabled.checked && gridfinityResizePending) resizeGridfinityBody();
      else snapGridfinityBody();
    }
    scheduleUpdate();
  });
});
[compartmentsX, compartmentsY].forEach((input) => {
  const updateCounts = () => {
    resetDividerCounts();
    scheduleUpdate();
  };
  input.addEventListener("input", updateCounts);
  input.addEventListener("change", updateCounts);
});
dividerHeightInput.addEventListener("input", () => {
  dividerState.heights = {};
  delete cellInputErrors[cellHeight.id];
  scheduleUpdate();
});
cellSelect.addEventListener("change", () => {
  const value = cellSelect.value;
  if (!value) {
    selectCell(undefined);
  } else {
    const [column, row] = value.split(",").map(Number);
    selectCell({ column, row });
  }
});
[cellWidth, cellDepth, cellHeight].forEach((input) => {
  input.addEventListener("input", () => editCell(input));
});
lidEnabled.addEventListener("change", () => {
  lidOptions.hidden = !lidEnabled.checked;
  exportLidButton.hidden = !lidEnabled.checked;
  scheduleUpdate();
});
gridfinityEnabled.addEventListener("change", () => {
  gridfinitySettings.hidden = !gridfinityEnabled.checked;
  exportGridfinityButton.hidden = !gridfinityEnabled.checked;
  if (!gridfinityEnabled.checked) {
    gridfinityMove.setAttribute("aria-pressed", "false");
    gridfinityCountError = "";
    gridfinityResizePending = false;
  }
  snapGridfinityBody();
  scheduleUpdate();
});
gridfinityPitch.addEventListener("change", () => {
  if (gridfinityEnabled.checked) resizeGridfinityBody();
  scheduleUpdate();
});
[gridfinityFeetX, gridfinityFeetY].forEach((input) => {
  input.addEventListener("input", () => {
    resizeGridfinityBody();
    scheduleUpdate();
  });
});
[gridfinityColumns, gridfinityRows, gridfinityColumn, gridfinityRow].forEach((input) => {
  input.addEventListener("input", scheduleUpdate);
});
gridfinityMove.addEventListener("click", () => {
  const moving = gridfinityMove.getAttribute("aria-pressed") !== "true";
  gridfinityMove.setAttribute("aria-pressed", String(moving));
  if (moving) {
    skadisMove.setAttribute("aria-pressed", "false");
    edgeMode.setAttribute("aria-pressed", "false");
    renderEdgeOverlay();
    if (modelRoot) resetCamera(true);
  }
});
skadisEnabled.addEventListener("change", () => {
  skadisSettings.hidden = !skadisEnabled.checked;
  backViewButton.hidden = !skadisEnabled.checked;
  if (skadisEnabled.checked && modelRoot) {
    showSkadisBack();
  }
  scheduleUpdate();
});
skadisBoardThickness.addEventListener("input", scheduleUpdate);
[skadisOffsetX, skadisOffsetZ].forEach((input) => input.addEventListener("input", scheduleUpdate));
skadisMove.addEventListener("click", () => {
  const moving = skadisMove.getAttribute("aria-pressed") !== "true";
  skadisMove.setAttribute("aria-pressed", String(moving));
  if (moving) {
    edgeMode.setAttribute("aria-pressed", "false");
    gridfinityMove.setAttribute("aria-pressed", "false");
    renderEdgeOverlay();
  }
  if (moving && modelRoot) showSkadisBack();
});
skadisPicker.addEventListener("click", (event) => {
  const slot = event.target.closest("[data-column][data-row]");
  if (slot) {
    const column = Number(slot.dataset.column);
    const row = Number(slot.dataset.row);
    toggleSkadisSlot(column, row);
    skadisPicker.querySelector(`[data-column="${column}"][data-row="${row}"]`)?.focus();
  }
});
document.querySelector("#skadis-clear").addEventListener("click", () => {
  skadisSelection.length = 0;
  scheduleUpdate();
});
canvas.addEventListener("pointerdown", (event) => {
  skadisPointerStart = { x: event.clientX, y: event.clientY };
});
function gridfinityDragPoint(event, height) {
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !gridfinityOverlay || gridfinityMove.getAttribute("aria-pressed") !== "true") return;
  const layout = readGridfinityLayout(readBody());
  const height = gridfinityOverlay.children[0].position.y;
  const point = gridfinityDragPoint(event, height);
  if (!point) return;
  gridfinityDrag = { layout, point, height };
  event.stopImmediatePropagation();
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  clearTimeout(rebuildTimer);
  modelVersion += 1;
  exportButton.disabled = true;
  exportLidButton.disabled = true;
  exportSkadisHookButton.disabled = true;
  exportGridfinityButton.disabled = true;
}, true);
canvas.addEventListener("pointermove", (event) => {
  if (!gridfinityDrag) return;
  const point = gridfinityDragPoint(event, gridfinityDrag.height);
  if (!point) return;
  const { layout } = gridfinityDrag;
  const column = layout.column - Math.round((point.x - gridfinityDrag.point.x) / layout.pitch);
  const row = layout.row + Math.round((point.z - gridfinityDrag.point.z) / layout.pitch);
  gridfinityColumn.value = String(Math.max(0, Math.min(layout.plateColumns - layout.columns, column)));
  gridfinityRow.value = String(Math.max(0, Math.min(layout.plateRows - layout.rows, row)));
  renderGridfinityOverlay();
  setStatus("Grundplatte wird rastergenau verschoben.");
});
function finishGridfinityDrag() {
  if (!gridfinityDrag) return;
  gridfinityDrag = undefined;
  skadisPointerStart = undefined;
  controls.enabled = true;
  scheduleUpdate();
}
canvas.addEventListener("pointercancel", finishGridfinityDrag);
canvas.addEventListener("lostpointercapture", finishGridfinityDrag);
canvas.addEventListener("pointerup", finishGridfinityDrag, true);
function skadisDragPoint(event, planeZ) {
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ), new THREE.Vector3());
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !skadisOverlay || skadisMove.getAttribute("aria-pressed") !== "true"
    || camera.position.z >= skadisOverlay.children[0].position.z) return;
  const planeZ = skadisOverlay.children[0].position.z;
  const point = skadisDragPoint(event, planeZ);
  if (!point) return;
  skadisDrag = { point, planeZ, x: skadisOffsetX.valueAsNumber, z: skadisOffsetZ.valueAsNumber };
  if (!Number.isFinite(skadisDrag.x) || !Number.isFinite(skadisDrag.z)) {
    skadisDrag = undefined;
    setStatus("Bitte zuerst eine gültige Rasterverschiebung eingeben.", "error");
    return;
  }
  event.stopImmediatePropagation();
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  clearTimeout(rebuildTimer);
  modelVersion += 1;
  exportButton.disabled = true;
  exportLidButton.disabled = true;
}, true);
canvas.addEventListener("pointermove", (event) => {
  if (!skadisDrag) return;
  const point = skadisDragPoint(event, skadisDrag.planeZ);
  if (!point) return;
  skadisOffsetX.value = Math.max(-1000, Math.min(1000, skadisDrag.x + point.x - skadisDrag.point.x)).toFixed(1);
  skadisOffsetZ.value = Math.max(-1000, Math.min(1000, skadisDrag.z + point.y - skadisDrag.point.y)).toFixed(1);
  renderSkadisPicker();
  setStatus("Raster wird verschoben; das Modell wird nach dem Loslassen neu berechnet.");
});
function finishSkadisDrag() {
  if (!skadisDrag) return;
  skadisDrag = undefined;
  skadisPointerStart = undefined;
  controls.enabled = true;
  scheduleUpdate();
}
canvas.addEventListener("pointercancel", finishSkadisDrag);
canvas.addEventListener("lostpointercapture", finishSkadisDrag);
canvas.addEventListener("pointerup", finishSkadisDrag, true);
canvas.addEventListener("pointerup", (event) => {
  if (event.button !== 0 || skadisMove.getAttribute("aria-pressed") === "true"
    || gridfinityMove.getAttribute("aria-pressed") === "true" || !skadisPointerStart
    || Math.hypot(event.clientX - skadisPointerStart.x, event.clientY - skadisPointerStart.y) > 5) return;
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    (event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  if (edgeMode.getAttribute("aria-pressed") === "true") {
    if (!edgeOverlay || !modelRoot) return;
    const marker = raycaster.intersectObjects(edgeOverlay.children)[0];
    if (!marker) return;
    const modelHit = raycaster.intersectObject(modelRoot, true)[0];
    if (modelHit && modelHit.distance + 0.05 < marker.distance) return;
    const id = marker.object.userData.edgeId;
    updateEdgeSelection(id, !selectedEdges.has(id));
    return;
  }
  if (skadisOverlay && camera.position.z < skadisOverlay.children[0].position.z) {
    const hit = raycaster.intersectObjects(skadisOverlay.children)
      .find((intersection) => intersection.object.userData.skadisSlot);
    if (hit) {
      toggleSkadisSlot(hit.object.userData.skadisSlot.column, hit.object.userData.skadisSlot.row);
      return;
    }
  }
  if (!cellOverlay || !modelRoot) return;
  const cellHit = raycaster.intersectObjects(cellOverlay.children)[0];
  if (!cellHit) return;
  const modelHit = raycaster.intersectObject(modelRoot, true)[0];
  if (!modelHit || cellHit.distance < modelHit.distance) selectCell(cellHit.object.userData.cell);
});
document.querySelectorAll("[data-add-cut]").forEach((button) => {
  button.addEventListener("click", () => addContainerCut(button.dataset.addCut));
});
cutList.addEventListener("input", (event) => {
  const input = event.target;
  if (input.tagName !== "INPUT" || !input.dataset.cutProp) {
    return;
  }
  const item = input.closest("[data-cut-id]");
  const cut = containerCuts.find((candidate) => candidate.id === Number(item.dataset.cutId));
  if (cut) {
    cut[input.dataset.cutProp] = input.value === "" ? NaN : Number(input.value);
    scheduleUpdate();
  }
});
cutList.addEventListener("change", (event) => {
  const select = event.target;
  if (select.dataset.cutProp !== "face") {
    return;
  }
  const item = select.closest("[data-cut-id]");
  const cut = containerCuts.find((candidate) => candidate.id === Number(item.dataset.cutId));
  if (cut) {
    const changedPlane = (cut.face === "bottom") !== (select.value === "bottom");
    cut.face = select.value;
    if (changedPlane) {
      cut.v = cut.face === "bottom" ? 0 : readBody().height / 2;
    }
    renderCuts();
    scheduleUpdate();
  }
});
cutList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-cut]");
  if (!button) {
    return;
  }
  const index = containerCuts.findIndex((cut) => cut.id === Number(button.dataset.removeCut));
  if (index >= 0) {
    containerCuts.splice(index, 1);
    renderCuts();
    scheduleUpdate();
  }
});
document.querySelectorAll("[data-add-feature]").forEach((button) => {
  button.addEventListener("click", () => addFeature(button.dataset.addFeature));
});
featureList.addEventListener("input", (event) => {
  const target = event.target;
  const item = target.closest("[data-feature-id]");
  if (!item || !target.dataset.featureProp) {
    return;
  }
  const feature = features.find((candidate) => candidate.id === Number(item.dataset.featureId));
  if (!feature) {
    return;
  }
  feature[target.dataset.featureProp] = target.tagName === "SELECT" ? target.value : Number(target.value);
  scheduleUpdate();
});
featureList.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.featureProp !== "mode") {
    return;
  }
  const item = target.closest("[data-feature-id]");
  const feature = features.find((candidate) => candidate.id === Number(item.dataset.featureId));
  if (feature) {
    feature.mode = target.value;
    renderFeatures();
    renderCuts();
    scheduleUpdate();
  }
});
featureList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-feature]");
  if (!button) {
    return;
  }
  const index = features.findIndex((feature) => feature.id === Number(button.dataset.removeFeature));
  if (index >= 0) {
    features.splice(index, 1);
    renderFeatures();
    scheduleUpdate();
  }
});
exportButton.addEventListener("click", () => exportStl(currentShape, "koerper"));
exportLidButton.addEventListener("click", () => exportStl(currentLid, "deckel"));
exportGridfinityButton.addEventListener("click", () => {
  if (exportGridfinityButton.disabled || buildFailed) return;
  let plate;
  try {
    setStatus("Berechne Gridfinity-Grundplatte …");
    plate = buildGridfinityPlate(readGridfinityLayout(readBody()));
    const mesh = new oc.BRepMesh_IncrementalMesh_2(plate, 0.1, false, 0.2, false);
    mesh.delete();
    exportStl(plate, "gridfinity-grundplatte");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`Grundplatte konnte nicht erstellt werden: ${detail}`, "error");
  } finally {
    if (plate) plate.delete();
  }
});
exportSkadisHookButton.addEventListener("click", exportSkadisHook);
document.querySelector("#reset-view").addEventListener("click", () => resetCamera());
document.querySelector("#top-view").addEventListener("click", () => resetCamera(true));
backViewButton.addEventListener("click", showSkadisBack);

renderBodyFields();
renderEdgeList();
renderFeatures();
setupViewport();
initializeOpenCascade().then((instance) => {
  oc = instance;
  setStatus("CAD-Kern bereit. Modell wird berechnet …");
  updateModel();
}).catch((error) => {
  placeholder.innerHTML = "<strong>3D-Kern konnte nicht geladen werden</strong><span>Bitte starte die App lokal mit npm run dev.</span>";
  setStatus(`Lokaler CAD-Kern konnte nicht gestartet werden: ${error.message}`, "error");
});
