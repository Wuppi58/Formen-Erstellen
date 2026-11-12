import test from "node:test";
import assert from "node:assert/strict";
import { getCellDividerKeys, getDividerHeight, getDividerLayout, getLidDividerNotchDepth, resizeDividerCell } from "../src/container-dividers.js";

const box = { height: 40, base: 2 };

test("divider height defaults to the current inside height and validates explicit values", () => {
  assert.equal(getDividerHeight(box, null), 38);
  assert.equal(getDividerHeight({ ...box, height: 60 }, null), 58);
  assert.equal(getDividerHeight(box, 10), 10);
  assert.equal(getDividerHeight(box, 38), 38);
  for (const height of [0, 0.05, -1, 38.1, NaN, Infinity]) {
    assert.throws(() => getDividerHeight(box, height), /Fächerhöhe/);
  }
});

test("lid notches accommodate only the overlap with the divider plus clearance", () => {
  assert.equal(getLidDividerNotchDepth(box, 10, 3, 0.25), 0);
  assert.equal(getLidDividerNotchDepth(box, 34.75, 3, 0.25), 0);
  assert.equal(getLidDividerNotchDepth(box, 36.5, 3, 0.25), 1.75);
  assert.equal(getLidDividerNotchDepth(box, 38, 3, 0.25), 3);
  assert.equal(getLidDividerNotchDepth(box, 37, 3, 0), 2);
});

test("resizing a cell moves one shared wall without changing the box or other columns", () => {
  const body = { width: 104, depth: 64, height: 40, base: 2, wall: 2 };
  const xs = [1 / 3, 2 / 3];
  const ys = [0.5];
  const original = getDividerLayout(body, 3, 2, xs, ys, 38);
  const changedXs = resizeDividerCell(body, original, "x", 0, 20, xs);
  const changed = getDividerLayout(body, 3, 2, changedXs, ys, 38);
  assert.ok(Math.abs(changed.columns[0].size - 20) < 1e-8);
  assert.ok(Math.abs(changed.columns[2].size - original.columns[2].size) < 1e-8);
  assert.ok(Math.abs(changed.columns[1].size - (original.columns[1].size + original.columns[0].size - 20)) < 1e-8);
  const finalXs = resizeDividerCell(body, changed, "x", 2, 25, changedXs);
  const final = getDividerLayout(body, 3, 2, finalXs, ys, 38);
  assert.ok(Math.abs(final.columns[2].size - 25) < 1e-8);
  assert.throws(() => resizeDividerCell(body, original, "x", 0, 90, xs), /Nachbarfach/);
  assert.throws(() => resizeDividerCell(body, original, "x", 0, 0, xs), /Fachmaß/);
});

test("cell heights apply to shared wall segments and equal segments merge", () => {
  const body = { width: 104, depth: 64, height: 40, base: 2, wall: 2 };
  const keys = getCellDividerKeys(0, 0, 2, 2);
  assert.deepEqual(keys, ["x:1:0", "y:1:0"]);
  const heights = Object.fromEntries(keys.map((key) => [key, 10]));
  const layout = getDividerLayout(body, 2, 2, [0.5], [0.5], 38, heights);
  assert.deepEqual(layout.segments.map((segment) => [segment.axis, segment.height]), [
    ["x", 10], ["x", 38], ["y", 10], ["y", 38]
  ]);
  assert.equal(getDividerLayout(body, 2, 2, [0.5], [0.5], 38).segments.length, 2);
  assert.throws(() => getDividerLayout({ ...body, height: 11 }, 2, 2, [0.5], [0.5], 9, heights), /Fächerhöhe/);
});

test("row resizing and box scaling keep the shared grid within the interior", () => {
  const body = { width: 104, depth: 64, height: 40, base: 2, wall: 2 };
  const layout = getDividerLayout(body, 2, 2, [0.5], [0.5], 38);
  const fractions = resizeDividerCell(body, layout, "y", 1, 20, [0.5]);
  const resized = getDividerLayout(body, 2, 2, [0.5], fractions, 38);
  assert.ok(Math.abs(resized.rows[1].size - 20) < 1e-8);
  assert.ok(Math.abs(resized.rows[0].size - 38) < 1e-8);
  const scaled = getDividerLayout({ ...body, depth: 124 }, 2, 2, [0.5], fractions, 38);
  assert.ok(Math.abs(scaled.rows[1].size - 41) < 1e-8);
  assert.throws(() => getDividerLayout({ ...body, depth: 4.1 }, 2, 2, [0.5], fractions, 38), /zu schmal/);
});
