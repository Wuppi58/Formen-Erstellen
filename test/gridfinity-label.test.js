import test from "node:test";
import assert from "node:assert/strict";
import { getGridfinityLabelLayout } from "../src/gridfinity-label.js";

const box = { shape: "container", width: 41.5, depth: 41.5, height: 40, base: 2, wall: 2 };

test("Gridfinity label layout creates a rounded scoop and a shallow label recess", () => {
  const layout = getGridfinityLabelLayout(box);
  assert.equal(layout.scoop.radius, layout.scoop.depth);
  assert.ok(layout.scoop.depth <= 12);
  assert.equal(layout.scoop.width, box.width);
  assert.equal(layout.panel.width, box.width - 2 * (box.wall + 0.02));
  assert.equal(layout.panel.height, 13);
  assert.equal(layout.panel.centerCoord, layout.wall.innerCoord + layout.wall.inwardSign * 6.5);
  assert.ok(Math.abs((layout.panel.width - layout.panel.innerWidth) / 2 - layout.panel.depth) < 1e-8);
  assert.ok(Math.abs((layout.panel.height - layout.panel.innerHeight) / 2 - layout.panel.depth) < 1e-8);
  assert.ok(layout.panel.bottomZ > box.base);
  assert.equal(layout.panel.centerCoord, layout.wall.innerCoord + layout.wall.inwardSign * layout.panel.height / 2);
  assert.equal(layout.panel.surfaceZ, box.height);
  assert.equal(layout.text, undefined);
});

test("label surface extends 13 mm into a narrow gridfinity box", () => {
  const layout = getGridfinityLabelLayout({ ...box, width: 13.5, depth: 13.5 });
  assert.equal(layout.panel.height, 13);
  assert.equal(layout.panel.centerCoord, layout.wall.innerCoord + 6.5);
  assert.equal(layout.panel.bottomZ, box.height - 13);
});

test("scoop and label span the selected wall length on all four sides", () => {
  const rectangularBox = { ...box, width: 83.5, depth: 41.5 };
  const front = getGridfinityLabelLayout(rectangularBox, "", 0, "front");
  const right = getGridfinityLabelLayout(rectangularBox, "", 0, "right");
  assert.equal(front.scoop.width, rectangularBox.width);
  assert.equal(right.scoop.width, rectangularBox.depth);
  for (const wall of ["front", "back", "left", "right"]) {
    const layout = getGridfinityLabelLayout(rectangularBox, "", 0, wall);
    assert.equal(layout.wall.axis, wall === "front" || wall === "back" ? "x" : "y");
    assert.equal(layout.panel.width, layout.wall.wallLength - 2 * (rectangularBox.wall + 0.02));
  }
});

test("scoop spans wall-to-wall independent of corner radius on long and short sides", () => {
  const rectangularBox = { ...box, width: 83.5, depth: 41.5 };
  for (const wall of ["front", "right"]) {
    const sharp = getGridfinityLabelLayout(rectangularBox, "", 0, wall);
    const rounded = getGridfinityLabelLayout(rectangularBox, "", 3.5, wall);
    assert.equal(sharp.scoop.width, rounded.wall.wallLength);
    assert.equal(rounded.scoop.width, rounded.wall.wallLength);
    assert.equal(rounded.panel.width, rounded.wall.wallLength - 2 * (3.5 + 0.02));
  }
});

test("label panel leaves clearance for the rounded side-wall corners", () => {
  const layout = getGridfinityLabelLayout({ ...box, width: 83.5, depth: 41.5 }, "", 3.5);
  assert.equal(layout.panel.width, layout.wall.wallLength - 2 * (3.5 + 0.02));
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
  const narrow = getGridfinityLabelLayout({ ...box, width: 13.5, wall: 3 }, "", 3.1);
  assert.equal(narrow.scoop.width, 13.5);
  assert.throws(() => getGridfinityLabelLayout(box, "", 20), /zu klein/);
  assert.throws(() => getGridfinityLabelLayout(box, "M3", 18), /Text kürzen/);
});
