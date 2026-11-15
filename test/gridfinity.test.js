import test from "node:test";
import assert from "node:assert/strict";
import { getGridfinityLayout, gridfinityBoxDimensions, gridfinityCount, gridfinityFootProfile, gridfinityPlateOffset, gridfinitySocketProfile, gridfinityStackingLipProfile, GRIDFINITY_STACKING_LIP_HEIGHT, snapGridfinityDimension } from "../src/gridfinity.js";

test("Boxmaße werden für alle Rastergrößen nach oben ausgerichtet", () => {
  for (const pitch of [42, 21, 14]) {
    assert.equal(snapGridfinityDimension(pitch - 0.5, pitch), pitch - 0.5);
    assert.equal(snapGridfinityDimension(pitch, pitch), 2 * pitch - 0.5);
    assert.equal(gridfinityCount(2 * pitch - 0.5, pitch), 2);
    assert.ok(Number.isNaN(gridfinityCount(pitch, pitch)));
  }
});

test("Gewählte Fußzahlen ergeben passende Außenmaße und Rasterbelegungen", () => {
  for (const pitch of [42, 21, 14]) {
    for (const [columns, rows] of [[3, 2], [4, 4], [1, 5]]) {
      const { width, depth } = gridfinityBoxDimensions(columns, rows, pitch);
      assert.equal(width, columns * pitch - 0.5);
      assert.equal(depth, rows * pitch - 0.5);
      const layout = getGridfinityLayout({ shape: "container", width, depth }, pitch, columns, rows, 0, 0);
      assert.equal(layout.columns, columns);
      assert.equal(layout.rows, rows);
    }
  }
  for (const [columns, rows] of [[0, 2], [1.5, 2], [NaN, 1], [9, 8]]) {
    assert.throws(() => gridfinityBoxDimensions(columns, rows, 42), /Fuß/);
  }
  assert.throws(() => gridfinityBoxDimensions(24, 1, 42), /1.000 mm/);
});

test("42-mm-Fuß und Grundplatte haben die dokumentierten Profilmaße", () => {
  assert.deepEqual(gridfinityFootProfile(42).slice(0, 4), [
    { z: -4.75, width: 35.6, radius: 0.8 },
    { z: -3.95, width: 37.2, radius: 1.6 },
    { z: -2.15, width: 37.2, radius: 1.6 },
    { z: 0, width: 41.5, radius: 3.75 }
  ]);
  const socket = gridfinitySocketProfile(42);
  assert.deepEqual(socket.slice(1, 5), [
    { z: 0.35, width: 36.3, radius: 1.15 },
    { z: 1.05, width: 37.7, radius: 1.85 },
    { z: 2.85, width: 37.7, radius: 1.85 },
    { z: 5, width: 42, radius: 4 }
  ]);
  for (const pitch of [21, 14]) {
    assert.equal(gridfinityFootProfile(pitch)[3].width, pitch - 0.5);
    assert.equal(gridfinitySocketProfile(pitch)[4].width, pitch);
  }
});

test("Position und Abmessungen einer Grundplatte müssen zur Box passen", () => {
  const body = { shape: "container", width: 83.5, depth: 41.5 };
  const layout = getGridfinityLayout(body, 42, 4, 3, 1, 2);
  assert.deepEqual(gridfinityPlateOffset(layout), { x: 0, y: -42 });
  assert.throws(() => getGridfinityLayout(body, 42, 2, 1, 1, 0), /passt/);
  assert.throws(() => getGridfinityLayout(body, 42, 9, 8, 0, 0), /höchstens 64/);
  assert.throws(() => getGridfinityLayout({ ...body, width: 83 }, 42, 4, 3, 0, 0), /Außenmaße/);
  assert.throws(() => getGridfinityLayout({ ...body, shape: "cylinder" }, 42, 4, 3, 0, 0), /rechteckige Boxen/);
});

test("Füße und Sockel haben bei allen drei Rastergrößen Spiel", () => {
  const widthAt = (sections, z) => {
    if (z <= sections[0].z) return sections[0].width;
    const upper = sections.findIndex((section) => section.z >= z);
    const a = sections[upper - 1];
    const b = sections[upper];
    return a.width + (b.width - a.width) * (z - a.z) / (b.z - a.z);
  };
  for (const pitch of [42, 21, 14]) {
    const foot = gridfinityFootProfile(pitch);
    const socket = gridfinitySocketProfile(pitch);
    for (const z of [0.35, 0.5, 1.05, 2, 2.85, 4.5, 5]) {
      const clearance = widthAt(socket, z) - widthAt(foot, z - 5.1);
      assert.ok(clearance >= 0.49 && clearance <= 0.71, `${pitch} mm, Höhe ${z}: ${clearance}`);
    }
  }
});

test("Stapelrandprofil hat 3,8 mm Höhe und ausreichend Platz für das Fußraster", () => {
  const profile = gridfinityStackingLipProfile(
    { shape: "container", width: 83.5, depth: 41.5, wall: 2 },
    42,
    2,
    1
  );
  assert.equal(GRIDFINITY_STACKING_LIP_HEIGHT, 3.8);
  assert.equal(profile[0].width, 79.5);
  assert.equal(profile[0].depth, 37.5);
  assert.equal(profile[3].width, 82.3);
  assert.equal(profile[3].depth, 40.3);
  assert.ok(profile[4].z > GRIDFINITY_STACKING_LIP_HEIGHT);
  assert.equal(profile[4].width, profile[3].width);
  assert.equal(profile[4].depth, profile[3].depth);
});

test("Stapelrandprofil lehnt Wände ab, die das Fußraster blockieren", () => {
  assert.throws(() => gridfinityStackingLipProfile(
    { shape: "container", width: 41.5, depth: 41.5, wall: 3 },
    42,
    1,
    1
  ), /Wand.*zu dick/);
});
