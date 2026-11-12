import test from "node:test";
import assert from "node:assert/strict";
import { getSkadisGrid, getSkadisHooks, getSkadisPlan, hasSkadisFeatureConflict, SkadisCapacityError } from "../src/skadis.js";
import { getInsertSpec, getSkadisBoardOffset } from "../src/skadis-inserts.js";

const box = { shape: "container", width: 60, depth: 40, height: 40 };
const horizontal = { count: 2, direction: "horizontal" };

test("manual selection follows the staggered Skådis grid and determines the exported hook positions", () => {
  const body = { ...box, width: 120, height: 100 };
  const grid = getSkadisGrid(body, 0);
  const selected = [{ column: 0, row: 0 }, { column: 1, row: 0 }, { column: 0, row: 1 }];
  const positions = selected.map((slot) => grid.find((item) => item.column === slot.column && item.row === slot.row));
  assert.deepEqual(positions.map(({ x, z }) => [x, z]), [[0, 30], [20, 50], [0, 70]]);
  const hooks = getSkadisHooks(body, 5.5, 0, [], { positions: selected });
  assert.deepEqual(hooks.map((hook) => [hook.shelf.x, hook.shelf.z + hook.shelf.height / 2]), [[0, 30], [20, 50], [0, 70]]);
});

test("manual selection allows no hooks and rejects duplicate, out-of-bounds and conflicting positions", () => {
  const body = { ...box, width: 120, height: 100 };
  const slot = { column: 0, row: 0 };
  const hooks = (positions, cuts = []) => getSkadisHooks(body, 5.5, 0, cuts, { positions });
  assert.equal(hooks([]).length, 0);
  assert.throws(() => hooks([slot, slot]), /Auswahl anpassen/);
  assert.throws(() => hooks([{ column: 10, row: 0 }]), /Auswahl anpassen/);
  assert.throws(() => hooks([slot], [{ face: "back", type: "circle", u: 0, v: 30, diameter: 5 }]), /überschneidet/);
  assert.throws(() => getSkadisHooks({ ...body, width: 20 }, 5.5, 0, [], { positions: [{ column: 2, row: 0 }] }), /Auswahl anpassen/);
});

test("allows selecting every available hole, including more than ten", () => {
  const body = { ...box, width: 200, height: 140 };
  const grid = getSkadisGrid(body, 0);
  assert.ok(grid.length > 10);
  const hooks = getSkadisHooks(body, 5.5, 0, [], { positions: grid });
  assert.equal(hooks.length, grid.length);
  assert.deepEqual(hooks.map((hook) => [hook.shelf.x, hook.shelf.z + hook.shelf.height / 2]),
    grid.map(({ x, z }) => [x, z]));
  assert.equal(getSkadisHooks(body, 5.5, 0, [], { count: 12, direction: "horizontal" }).length, 12);
});

test("default box has two selectable holes side by side", () => {
  const positions = getSkadisGrid(box, 0);
  assert.deepEqual(positions.map(({ x, z }) => [x, z]), [[-20, 20], [20, 20]]);
});

test("moving the grid moves selected hooks while preserving the stagger and validates the new bounds", () => {
  const body = { ...box, width: 120, height: 100 };
  const positions = [{ column: 0, row: 0 }, { column: 1, row: 0 }];
  const hooks = getSkadisHooks(body, 5.5, 0, [], { positions, offset: { x: 7, z: 5 } });
  assert.deepEqual(hooks.map((hook) => [hook.shelf.x, hook.shelf.z + hook.shelf.height / 2]), [[7, 35], [27, 55]]);
  assert.throws(() => getSkadisHooks(body, 5.5, 0, [], { positions, offset: { x: 100, z: 0 } }), /Auswahl anpassen/);
  assert.throws(() => getSkadisHooks(body, 5.5, 0, [], { positions, offset: { x: NaN, z: 0 } }), /Rasterverschiebung/);
});

test("places two joined hooks on the back with 40 mm spacing and room for the board", () => {
  const [left, right] = getSkadisHooks(box, 5.5, 0, [], horizontal);
  assert.equal(right.shelf.x - left.shelf.x, 40);
  assert.equal(left.shelf.width, 3.8);
  assert.ok(left.shelf.y - left.shelf.depth / 2 < box.depth / 2);
  assert.ok(left.shelf.y + left.shelf.depth / 2 > left.tail.y - left.tail.depth / 2);
  assert.ok(Math.abs((left.tail.y - left.tail.depth / 2) - (box.depth / 2 + 5.8)) < 1e-10);
  assert.equal(left.shelf.z - left.tail.z, 5.5);
  assert.ok(((left.shelf.width / 2) / 2.5) ** 2 + ((left.tail.height / 2) / 7.5) ** 2 < 1);
  const holeHalfHeightAtHookEdge = 7.5 * Math.sqrt(1 - ((left.shelf.width / 2) / 2.5) ** 2);
  const seatedShelfTop = left.tail.height / 2 - 5;
  assert.ok(seatedShelfTop - left.shelf.height > -holeHalfHeightAtHookEdge);
  assert.ok(seatedShelfTop - left.tail.height < -7.5);
});

test("rejects unsupported shapes, inadequate space and invalid board thickness", () => {
  assert.throws(() => getSkadisHooks({ ...box, shape: "unknown" }, 5.5, 0, [], horizontal), /nicht verfügbar/);
  assert.throws(() => getSkadisHooks(box, 0, 0, [], horizontal), /Lochwandstärke/);
  assert.throws(() => getSkadisHooks({ ...box, width: 3 }, 5.5, 0, [], horizontal), /Außenlänge.*3.80/);
  assert.throws(() => getSkadisHooks({ ...box, height: 8 }, 5.5, 0, [], horizontal), /Außenhöhe.*8.51/);
  assert.throws(() => getSkadisHooks({ ...box, width: 44 }, 5.5, 1, [], horizontal), /höchstens 1/);
});

test("round shapes produce a slot and separate printable hook for each selected position", () => {
  for (const shape of ["roundContainer", "cylinder", "sphere"]) {
    const body = { shape, width: 120, depth: 120, height: 120, wall: 2, base: 2 };
    const slots = getSkadisGrid(body, 0);
    assert.ok(slots.length > 0, shape);
    const selected = [slots.find(({ x, z }) => x === 0 && z === 40)];
    assert.ok(selected[0], shape);
    const plan = getSkadisPlan(body, 5.5, 0, [], { positions: selected });
    assert.equal(plan.inserts.length, 1);
    const { slot, undercut, pieces } = plan.inserts[0];
    assert.equal(slot.width, 4.4);
    assert.equal(pieces.length, shape === "roundContainer" ? 6 : 5);
    assert.ok(pieces.every((piece) => piece.width === 3.8));
    assert.equal(Boolean(undercut), shape !== "roundContainer");
    assert.ok(slot.z > (shape === "roundContainer" ? body.base : 0));
    const moved = getSkadisPlan(body, 5.5, 0, [], { positions: selected, offset: { x: 5, z: 3 } });
    assert.equal(moved.inserts[0].slot.x, slot.x + 5);
    assert.equal(moved.inserts[0].slot.z, slot.z + 3);
  }
});

test("rejects machining features that intersect a selected slot", () => {
  const body = { shape: "cylinder", width: 120, depth: 120, height: 120 };
  const plan = getSkadisPlan(body, 5.5, 0, [], { positions: [{ column: 0, row: 0 }] });
  const drill = { type: "hole", mode: "through", x: 0, y: 58, diameter: 6 };
  assert.equal(hasSkadisFeatureConflict(body, [drill], plan), true);
  assert.equal(hasSkadisFeatureConflict(body, [{ ...drill, x: 30 }], plan), false);
  assert.equal(hasSkadisFeatureConflict(body, [{ ...drill, mode: "blind", depth: 10 }], plan), false);
});

test("separate hooks clear the basic round body both seated and while sliding into the slot", () => {
  for (const shape of ["roundContainer", "cylinder", "sphere"]) {
    const body = { shape, width: 120, depth: 120, height: 120, wall: 2, base: 2 };
    for (const position of getSkadisGrid(body, 0)) {
      const { inserts: [insert] } = getSkadisPlan(body, 5.5, 0, [], { positions: [position] });
      const removed = [insert.slot, ...(insert.undercut ? [insert.undercut] : [])];
      const lifts = shape === "roundContainer" ? [0, -1.4, -2.75] : [0, 1.4, 2.75];
      for (const lift of lifts) for (const piece of insert.pieces) {
        for (const dx of [0.1, 0.5, 0.9]) for (const dy of [0.1, 0.5, 0.9]) for (const dz of [0.1, 0.5, 0.9]) {
          const x = piece.x + (dx - 0.5) * piece.width;
          const y = piece.y + (dy - 0.5) * piece.depth;
          const z = piece.z + dz * piece.height + lift;
          const r = body.width / 2;
          const insideOuter = z > 0 && z < body.height
            && x * x + y * y + (shape === "sphere" ? (z - r) ** 2 : 0) < r * r;
          const insideHollow = shape === "roundContainer" && z > body.base
            && x * x + y * y < (r - body.wall) ** 2;
          const inSlot = removed.some((area) => Math.abs(x - area.x) < area.width / 2
            && Math.abs(y - area.y) < area.depth / 2 && z > area.z && z < area.z + area.height);
          assert.ok(!insideOuter || insideHollow || inSlot, `${shape} at ${position.x},${position.z}, lift ${lift}`);
        }
      }
    }
  }
});

test("round container bracket supports the floor, retains the top and clears the pegboard", () => {
  const body = { shape: "roundContainer", width: 120, depth: 120, height: 120, wall: 2, base: 2 };
  for (const position of getSkadisGrid(body, 0)) {
    const { inserts: [insert] } = getSkadisPlan(body, 5.5, 0, [], { positions: [position] });
    const { slot, support, pieces } = insert;
    const top = slot.z + slot.height;
    const nose = pieces[5];
    assert.ok(support.z < 0 && support.z + support.height <= 0);
    const outerAtEdge = Math.sqrt((body.width / 2) ** 2 - (Math.abs(position.x) + support.width / 2) ** 2);
    assert.ok(outerAtEdge - (support.y - support.depth / 2) >= Math.min(10, outerAtEdge - 0.1));
    assert.ok(nose.z + nose.height > top);
    assert.ok(nose.z + nose.height - 2.75 < top);
    const boardFront = body.width / 2 + getSkadisBoardOffset(body) + 0.2;
    for (const piece of [pieces[0], pieces[1], pieces[4], pieces[5]]) {
      assert.ok(piece.y + piece.depth / 2 < boardFront);
    }
    assert.ok(pieces[2].y + pieces[2].depth / 2 > boardFront + 5.5);
    assert.ok(pieces[3].y - pieces[3].depth / 2 > boardFront + 5.5);
  }
  assert.equal(getInsertSpec({ ...body, width: 16, depth: 16 }, 0, 0, 40, 5.5), null);
  const roundedBody = { ...body, wall: 12, base: 12 };
  const rounded = getInsertSpec(roundedBody, 10, 40, 60, 5.5);
  const flatBottom = Math.sqrt((body.width / 2 - 10) ** 2 - (40 + 4.4 / 2) ** 2);
  assert.ok(flatBottom - (rounded.support.y - rounded.support.depth / 2) >= 11.99);
});

test("round container holders reject overlapping columns and floor openings", () => {
  const body = { shape: "roundContainer", width: 120, depth: 120, height: 120, wall: 2, base: 2 };
  const slots = [{ column: 0, row: 0 }, { column: 0, row: 1 }];
  assert.throws(() => getSkadisPlan(body, 5.5, 0, [], { positions: slots }), /eine Halterung je Rasterspalte/);
  const cut = { face: "bottom", type: "circle", u: 0, v: 52, diameter: 4 };
  assert.throws(() => getSkadisPlan(body, 5.5, 0, [cut], { positions: [slots[0]] }), /Bodenöffnung/);
  assert.doesNotThrow(() => getSkadisPlan(body, 5.5, 0, [{ ...cut, u: 20 }], { positions: [slots[0]] }));
});

test("rejects back cuts that remove a hook attachment but permits other cuts", () => {
  const cut = { face: "back", type: "circle", u: 20, v: 20, diameter: 5 };
  assert.throws(() => getSkadisHooks(box, 5.5, 0, [cut], horizontal), /überschneidet/);
  assert.equal(getSkadisHooks(box, 5.5, 0, [{ ...cut, face: "front" }], horizontal).length, 2);
  assert.equal(getSkadisHooks(box, 5.5, 0, [{ ...cut, u: 0 }], horizontal).length, 2);
});

test("arranges 1 to 10 hooks on a 40 mm grid", () => {
  const largeBox = { ...box, width: 400, height: 400 };
  for (const direction of ["horizontal", "vertical"]) {
    for (const count of [1, 3, 8, 10]) {
      const hooks = getSkadisHooks(largeBox, 5.5, 0, [], { count, direction });
      assert.equal(hooks.length, count);
      const x = hooks.map((hook) => hook.shelf.x);
      const z = hooks.map((hook) => hook.shelf.z + hook.shelf.height / 2);
      for (let i = 1; i < count; i += 1) {
        assert.ok(Math.abs((x[i] - x[0]) / 40 - Math.round((x[i] - x[0]) / 40)) < 1e-9);
        assert.ok(Math.abs((z[i] - z[0]) / 40 - Math.round((z[i] - z[0]) / 40)) < 1e-9);
      }
      if (count > 1 && direction === "horizontal") assert.ok(Math.max(...x) - Math.min(...x) >= 320);
      if (count > 1 && direction === "vertical") assert.ok(Math.max(...z) - Math.min(...z) >= 320);
    }
  }
});

test("validates layout and the outermost hook's space and opening collisions", () => {
  for (const count of [0, 1.5, NaN]) {
    assert.throws(() => getSkadisHooks(box, 5.5, 0, [], { ...horizontal, count }), /Anzahl/);
  }
  assert.throws(() => getSkadisHooks(box, 5.5, 0, [], { ...horizontal, count: 1, direction: "diagonal" }), /Ausrichtung/);
  assert.throws(() => getSkadisHooks(box, 5.5, 0, [], { ...horizontal, count: 3 }), /höchstens 2/);
  assert.equal(getSkadisHooks(box, 5.5, 0, [], { ...horizontal, direction: "vertical" }).length, 2);
  const tallBox = { ...box, height: 100 };
  const cut = { face: "back", type: "circle", u: 0, v: 90, diameter: 5 };
  assert.throws(() => getSkadisHooks(tallBox, 5.5, 0, [cut], { ...horizontal, direction: "vertical" }), /überschneidet/);
  assert.equal(getSkadisHooks(tallBox, 5.5, 0, [{ ...cut, v: 50 }], { ...horizontal, direction: "vertical" }).length, 2);
});

test("automatically shifts four vertical hooks to fit the box while retaining 40 mm spacing", () => {
  const layout = { count: 4, direction: "vertical" };
  const shortBox = { ...box, height: 129 };
  const hooks = getSkadisHooks(shortBox, 5.5, 0, [], layout);
  assert.equal(hooks.length, 4);
  assert.deepEqual(hooks.map((hook) => hook.shelf.x), [0, 0, 0, 0]);
  assert.ok(Math.abs(hooks[0].tail.z - 0.01) < 1e-9);
  assert.ok(hooks[3].shelf.z + hooks[3].shelf.height <= shortBox.height);
  for (let i = 1; i < hooks.length; i += 1) {
    assert.ok(Math.abs(hooks[i].shelf.z - hooks[i - 1].shelf.z - 40) < 1e-9);
  }
  const cut = { face: "back", type: "circle", u: 0, v: 127.01, diameter: 5 };
  assert.throws(() => getSkadisHooks(shortBox, 5.5, 0, [cut], layout), /überschneidet/);
});

test("wraps into columns and reports when the available grid is too small", () => {
  const layout = { count: 4, direction: "vertical" };
  assert.equal(getSkadisHooks({ ...box, height: 128.5 }, 5.5, 0, [], layout).length, 4);
  assert.equal(getSkadisHooks({ ...box, height: 128.51 }, 5.5, 0, [], layout).length, 4);
  assert.throws(() => getSkadisHooks({ ...box, width: 20, height: 128.5 }, 5.5, 0, [], layout), /höchstens 3/);
});

test("distributes eight hooks over the middle of a wide box", () => {
  for (const height of [140, 400]) {
    const hooks = getSkadisHooks({ ...box, width: 200, height }, 5.5, 0, [], { count: 8, direction: "vertical" });
    const xs = [...new Set(hooks.map((hook) => hook.shelf.x))];
    const zs = [...new Set(hooks.map((hook) => hook.shelf.z + hook.shelf.height / 2))];
    assert.equal(hooks.length, 8);
    if (height === 140) {
      assert.deepEqual(xs, [-60, -20, 20, 60]);
      assert.deepEqual(zs, [10, 130]);
    } else {
      assert.deepEqual(xs, [-80, 80]);
      assert.equal(zs.length, 4);
    }
  }
});

test("spreads an incomplete grid while keeping every hook on the same board raster", () => {
  const hooks = getSkadisHooks({ ...box, width: 100, height: 140 }, 5.5, 0, [], { count: 5, direction: "vertical" });
  const unique = new Set(hooks.map((hook) => `${hook.shelf.x},${hook.shelf.z}`));
  assert.equal(unique.size, 5);
  for (const hook of hooks) {
    assert.equal((hook.shelf.x - hooks[0].shelf.x) % 40, 0);
    assert.ok(Math.abs((hook.shelf.z - hooks[0].shelf.z) / 40 - Math.round((hook.shelf.z - hooks[0].shelf.z) / 40)) < 1e-9);
  }
  assert.equal(new Set(hooks.map((hook) => hook.shelf.x)).size, 2);
  assert.equal(new Set(hooks.map((hook) => hook.shelf.z)).size, 3);
});

test("places nine hooks as a full 3 by 3 grid with a hook at the center", () => {
  const bigBox = { ...box, width: 400, height: 400 };
  const plan = getSkadisPlan(bigBox, 5.5, 0, [], { count: 9, direction: "vertical" });
  const xs = [...new Set(plan.hooks.map((hook) => hook.shelf.x))];
  const zs = [...new Set(plan.hooks.map((hook) => hook.shelf.z + hook.shelf.height / 2))];
  assert.deepEqual(xs, [-160, 0, 160]);
  assert.deepEqual(zs, [40, 200, 360]);
  assert.equal(plan.hooks.length, 9);
  assert.equal(plan.suggestions.length, 0);
});

test("suggests nearby full grids without changing the requested incomplete layout", () => {
  const bigBox = { ...box, width: 200, height: 140 };
  const plan = getSkadisPlan(bigBox, 5.5, 0, [], { count: 7, direction: "vertical" });
  assert.equal(plan.hooks.length, 7);
  assert.deepEqual(plan.suggestions, [
    { count: 6, columns: 3, rows: 2 },
    { count: 8, columns: 4, rows: 2 },
    { count: 9, columns: 3, rows: 3 }
  ]);
  assert.deepEqual(getSkadisPlan(bigBox, 5.5, 0, [], { count: 8, direction: "vertical" }).suggestions, []);
});

test("suggestions exclude alternative layouts conflicting with a back opening", () => {
  const bigBox = { ...box, width: 200, height: 140 };
  const cut = { face: "back", type: "circle", u: 0, v: 10, diameter: 5 };
  const plan = getSkadisPlan(bigBox, 5.5, 0, [cut], { count: 7, direction: "vertical" });
  assert.deepEqual(plan.suggestions, [
    { count: 8, columns: 4, rows: 2 },
    { count: 9, columns: 3, rows: 3 }
  ]);
});

test("suggests a fitting nearby grid when the requested number exceeds capacity", () => {
  const limitedBox = { ...box, height: 100 };
  assert.throws(
    () => getSkadisPlan(limitedBox, 5.5, 0, [], { count: 7, direction: "vertical" }),
    (error) => {
      assert.ok(error instanceof SkadisCapacityError);
      assert.match(error.message, /höchstens 6/);
      assert.deepEqual(error.suggestions, [{ count: 6, rows: 3, columns: 2 }]);
      return true;
    }
  );
});
