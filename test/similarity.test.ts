// SPDX-License-Identifier: Apache-2.0
// WCT-018: function-set similarity, clusters and template labels.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jaccard, nearDuplicates, SAC_ADMIN_FUNCTIONS, SEP41_FUNCTIONS, templateLabels, type FnSig } from "../src/similarity.ts";

test("jaccard on sets", () => {
  assert.equal(jaccard(["a", "b", "c"], ["a", "b", "c"]), 1);
  assert.equal(jaccard(["a", "b"], ["c"]), 0);
  assert.equal(jaccard(["a", "b", "c", "d"], ["a", "b", "c", "e"]), 3 / 5);
  assert.equal(jaccard(["a", "a", "b"], ["a", "b"]), 1, "duplicates do not count twice");
  assert.equal(jaccard([], []), 0);
});

const base = ["init", "deposit", "withdraw", "balance", "admin"];

test("clusters: single linkage at the threshold, tiny sets ignored, identical sets grouped", () => {
  const items = [
    { id: "h1", fns: base },
    { id: "h2", fns: [...base] }, // identical set
    { id: "h3", fns: [...base, "pause"] }, // 5/6 = 0.833 vs h1
    { id: "h4", fns: [...base, "pause", "unpause"] }, // 6/7 = 0.857 vs h3, 5/7 = 0.714 vs h1
    { id: "h5", fns: ["swap", "quote", "pool"] }, // unrelated
    { id: "h6", fns: ["init", "admin"] }, // below minFunctions
  ];
  const r = nearDuplicates(items, { threshold: 0.8, minFunctions: 3 });
  assert.equal(r.considered, 5);
  assert.equal(r.distinctSets, 4);
  assert.equal(r.clusters.length, 1);
  assert.deepEqual(r.clusters[0]!.members, ["h1", "h2", "h3", "h4"], "h4 joins through h3 (single linkage)");
  assert.equal(r.clusters[0]!.distinctSets, 3);
  assert.ok(Math.abs(r.clusters[0]!.minJ - 5 / 6) < 1e-9);
  assert.equal(r.edges, 2);
  assert.equal(r.neighbours.has("h6"), false);
  const n1 = r.neighbours.get("h1")!;
  assert.deepEqual(n1[0], { id: "h2", j: 1 });
  assert.equal(n1[1]!.id, "h3");
  assert.deepEqual(r.neighbours.get("h5"), []);
});

test("pairwise scores equal a brute-force computation on a pseudo-random corpus", () => {
  const names = Array.from({ length: 30 }, (_, i) => `f${i}`);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const items = Array.from({ length: 60 }, (_, i) => ({ id: `h${String(i).padStart(2, "0")}`, fns: names.filter(() => rnd() < 0.25) }));
  const r = nearDuplicates(items, { threshold: 0.4, minFunctions: 3, neighbours: 100, neighbourFloor: 0 });
  for (const it of items.filter((x) => new Set(x.fns).size >= 3)) {
    for (const nb of r.neighbours.get(it.id)!) {
      const other = items.find((x) => x.id === nb.id)!;
      assert.ok(Math.abs(nb.j - jaccard(it.fns, other.fns)) < 1e-12);
    }
  }
  // Every brute-force pair above the threshold lands in the same cluster.
  const clusterOf = new Map<string, number>();
  r.clusters.forEach((c, i) => c.members.forEach((m) => clusterOf.set(m, i)));
  const kept = items.filter((x) => new Set(x.fns).size >= 3);
  for (const a of kept) for (const b of kept) {
    if (a.id < b.id && jaccard(a.fns, b.fns) >= 0.4) {
      assert.ok(clusterOf.has(a.id) && clusterOf.get(a.id) === clusterOf.get(b.id), `${a.id} ${b.id}`);
    }
  }
});

test("template labels: SEP-41 by name and arity, SAC admin surface, partial", () => {
  const sep41: FnSig[] = [...SEP41_FUNCTIONS];
  assert.deepEqual(templateLabels(sep41), ["sep41"]);
  assert.deepEqual(templateLabels([...sep41, ...SAC_ADMIN_FUNCTIONS, { name: "upgrade", arity: 1 }]), ["sep41", "sep41-sac-admin"]);
  const wrongArity = sep41.map((f) => (f.name === "transfer" ? { name: "transfer", arity: 4 } : f));
  assert.deepEqual(templateLabels(wrongArity), ["sep41-partial"]);
  assert.deepEqual(templateLabels(sep41.slice(0, 7)), ["sep41-partial"]);
  assert.deepEqual(templateLabels(sep41.slice(0, 6)), []);
  assert.deepEqual(templateLabels([]), []);
});
