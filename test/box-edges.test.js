import test from "node:test";
import assert from "node:assert/strict";
import { getBoxEdges, getRoundedCellOutline, matchesBoxEdge, polygonArea, roundedCutFits, verticalRoundingFits } from "../src/box-edges.js";

const body = { width: 60, depth: 40, height: 40, wall: 2, base: 2 };
const front = ["vertical-front-left", "vertical-front-right"];

test("box edge descriptions identify each of the twelve original edges in either direction", () => {
  const edges = getBoxEdges(body);
  assert.equal(new Set(edges.map((edge) => edge.id)).size, 12);
  const edge = edges.find((item) => item.id === "vertical-front-left");
  assert.ok(matchesBoxEdge(edge, [-30, -20, 0], [-30, -20, 40]));
  assert.ok(matchesBoxEdge(edge, [-30, -20, 40], [-30, -20, 0]));
  assert.ok(!matchesBoxEdge(edge, [30, -20, 0], [30, -20, 40]));
});

test("large rounding allows tangent front corners but rejects overlapping corners", () => {
  assert.ok(verticalRoundingFits(body, 30, front));
  assert.ok(!verticalRoundingFits(body, 30.1, front));
  assert.ok(!verticalRoundingFits(body, 21, [...front, "vertical-back-left"]));
  assert.ok(verticalRoundingFits(body, 25, ["vertical-front-left"]));
});

test("cut validation protects rounded corners and leaves the rear flat wall available", () => {
  assert.ok(roundedCutFits(body, { face: "bottom", type: "circle", u: 0, v: 0, diameter: 4 }, 30, front));
  assert.ok(!roundedCutFits(body, { face: "bottom", type: "circle", u: 25, v: -15, diameter: 4 }, 30, front));
  assert.ok(!roundedCutFits(body, { face: "front", type: "rectangle", u: 0, width: 4 }, 30, front));
  assert.ok(roundedCutFits(body, { face: "back", type: "rectangle", u: 0, width: 4 }, 30, front));
});

test("cell outlines are clipped to the rounded inner footprint", () => {
  const full = { min: -28, max: 28 };
  const depth = { min: -18, max: 18 };
  const square = getRoundedCellOutline(body, 0, front, full, depth);
  const curved = getRoundedCellOutline(body, 30, front, full, depth);
  assert.equal(polygonArea(square), 56 * 36);
  assert.ok(polygonArea(curved) < polygonArea(square));
  assert.equal(polygonArea(getRoundedCellOutline(body, 30, front, { min: 25, max: 28 }, { min: -18, max: -15 })), 0);
});
