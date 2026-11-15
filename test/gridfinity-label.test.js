import test from "node:test";
import assert from "node:assert/strict";
import { getGridfinityLabelLayout } from "../src/gridfinity-label.js";

const box = { shape: "container", width: 41.5, depth: 41.5, height: 40, base: 2, wall: 2 };

test("Gridfinity label layout creates a rounded scoop and a shallow label recess", () => {
  const layout = getGridfinityLabelLayout(box);
  assert.equal(layout.scoop.radius, layout.scoop.depth);
  assert.ok(layout.scoop.depth <= 12);
  assert.equal(layout.scoop.width, box.width - 2 * (box.wall + 0.02));
  assert.equal(layout.panel.width, layout.scoop.width);
  assert.ok(Math.abs((layout.panel.width - layout.panel.innerWidth) / 2 - layout.panel.depth) < 1e-8);
  assert.ok(Math.abs((layout.panel.height - layout.panel.innerHeight) / 2 - layout.panel.depth) < 1e-8);
  assert.ok(layout.panel.bottomZ > box.base);
  assert.equal(layout.panel.centerCoord, layout.wall.innerCoord + layout.wall.inwardSign * layout.panel.height / 2);
  assert.equal(layout.panel.surfaceZ, box.height);
  assert.equal(layout.text, undefined);
});

test("scoop and label span the selected wall length on all four sides", () => {
  const rectangularBox = { ...box, width: 83.5, depth: 41.5 };
  const front = getGridfinityLabelLayout(rectangularBox, "", 0, "front");
  const right = getGridfinityLabelLayout(rectangularBox, "", 0, "right");
  assert.equal(front.scoop.width, rectangularBox.width - 2 * (rectangularBox.wall + 0.02));
  assert.equal(right.scoop.width, rectangularBox.depth - 2 * (rectangularBox.wall + 0.02));
  for (const wall of ["front", "back", "left", "right"]) {
    const layout = getGridfinityLabelLayout(rectangularBox, "", 0, wall);
    assert.equal(layout.wall.axis, wall === "front" || wall === "back" ? "x" : "y");
    assert.equal(layout.panel.width, layout.scoop.width);
  }
});

test("scoop ends meet the inner side-wall faces without cutting the side walls", () => {
  const layout = getGridfinityLabelLayout(box);
  const end = layout.scoop.width / 2 + 0.02;
  assert.equal(end, box.width / 2 - box.wall);
});

test("label text is normalized and fitted as printable block pixels", () => {
  const layout = getGridfinityLabelLayout(box, "m3 ä");
  assert.equal(layout.text.value, "M3 AE");
  assert.ok(layout.text.pixelSize >= 0.5);
  assert.ok(layout.text.runs.length > 0);
  assert.ok(getGridfinityLabelLayout({ ...box, width: 13.5, depth: 13.5 }, "M").text.pixelSize >= 0.5);
  assert.throws(() => getGridfinityLabelLayout({ ...box, width: 13.5, depth: 13.5 }, "M3 AE"), /Text kürzen/);
  assert.throws(() => getGridfinityLabelLayout(box, "TOO LONG LABEL"), /Text kürzen/);
  assert.throws(() => getGridfinityLabelLayout(box, "M3!"), /unterstützen/);
});

test("small box and excessive corner radius report when the grip and label do not fit", () => {
  assert.throws(() => getGridfinityLabelLayout({ ...box, height: 12 }), /zu klein/);
  assert.throws(() => getGridfinityLabelLayout({ ...box, width: 13.5, wall: 3 }, "", 3.1), /zu schmal/);
  assert.throws(() => getGridfinityLabelLayout(box, "M3", 18), /zu schmal/);
});
