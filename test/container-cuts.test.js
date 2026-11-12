import test from "node:test";
import assert from "node:assert/strict";
import { getCutSpec } from "../src/container-cuts.js";

const box = { shape: "container", width: 60, depth: 40, height: 40, wall: 2, base: 2 };
const round = { ...box, shape: "roundContainer", width: 60, depth: 60 };

test("bottom opening passes through the base without cutting the opposite side", () => {
  const spec = getCutSpec(box, { type: "circle", face: "bottom", u: 10, v: -5, diameter: 6 });
  assert.deepEqual(spec.center, [10, -5, -0.02]);
  assert.deepEqual(spec.direction, [0, 0, 1]);
  assert.equal(spec.size[2], 2.04);
});

test("each wall opening goes through only its own wall", () => {
  const cut = { type: "rectangle", u: 4, v: 15, width: 8, height: 6 };
  assert.deepEqual(getCutSpec(box, { ...cut, face: "front" }).center, [4, -20.02, 15]);
  assert.deepEqual(getCutSpec(box, { ...cut, face: "back" }).center, [4, 17.98, 15]);
  assert.deepEqual(getCutSpec(box, { ...cut, face: "left" }).center, [-30.02, 4, 15]);
  assert.deepEqual(getCutSpec(box, { ...cut, face: "right" }).center, [27.98, 4, 15]);
  assert.deepEqual(getCutSpec(box, { ...cut, face: "right" }).direction, [1, 0, 0]);
});

test("rejects cuts outside or touching the usable wall and floor", () => {
  assert.throws(() => getCutSpec(box, { type: "circle", face: "front", u: 0, v: 3, diameter: 6 }), /Wandfläche/);
  assert.throws(() => getCutSpec(box, { type: "circle", face: "bottom", u: 26, v: 0, diameter: 6 }), /Bodenfläche/);
  assert.throws(() => getCutSpec(box, { type: "rectangle", face: "bottom", u: NaN, v: 0, width: 5, height: 5 }), /gültig/);
});

test("round containers accept fitting bottom cuts and reject corners outside the circle", () => {
  assert.equal(getCutSpec(round, { type: "circle", face: "bottom", u: 0, v: 0, diameter: 5 }).axis, "z");
  assert.throws(() => getCutSpec(round, { type: "rectangle", face: "bottom", u: 19, v: 19, width: 4, height: 4 }), /Bodenfläche/);
  assert.throws(() => getCutSpec(round, { type: "circle", face: "front", u: 0, v: 15, diameter: 5 }), /nur im Boden/);
});
