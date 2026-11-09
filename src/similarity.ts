// SPDX-License-Identifier: Apache-2.0
// Near-duplicate depth (WCT-018): similarity of wasm by the set of function names
// their contractspecv0 declares, plus template labels that can be checked from the
// spec alone (SEP-41 token interface; SEP-41 plus the Stellar Asset Contract admin
// functions). Names come from untrusted spec data; nothing here renders them.

/** Jaccard index |A ∩ B| / |A ∪ B| of two name sets. Two empty sets score 0. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export type SimItem = { id: string; fns: string[] };
export type Neighbour = { id: string; j: number };
export type Cluster = { members: string[]; distinctSets: number; minJ: number };
export type SimOptions = {
  /** Edge threshold for clusters (single linkage). */
  threshold: number;
  /** Sets smaller than this are left out: a 1- or 2-function contract matches too much by chance. */
  minFunctions: number;
  /** Neighbours kept per item (highest Jaccard first, ties by id). */
  neighbours: number;
  /** Neighbours below this score are not kept. */
  neighbourFloor: number;
};

export const DEFAULT_SIM: SimOptions = { threshold: 0.8, minFunctions: 3, neighbours: 5, neighbourFloor: 0.5 };

export type SimResult = {
  options: SimOptions;
  /** Items with at least minFunctions names. */
  considered: number;
  /** Distinct function-name sets among them. */
  distinctSets: number;
  /** Pairs of distinct sets with Jaccard >= threshold. */
  edges: number;
  /** Connected components with two or more items, largest first. */
  clusters: Cluster[];
  /** Per item: most similar other items (excluding itself), Jaccard >= neighbourFloor. */
  neighbours: Map<string, Neighbour[]>;
};

function setKey(fns: string[]): string {
  return JSON.stringify([...new Set(fns)].sort());
}

/**
 * Exact pairwise Jaccard over distinct name sets using an inverted index (only
 * sets that share at least one name are compared), single-linkage clusters at
 * `threshold`, and the top neighbours of every item.
 */
export function nearDuplicates(items: SimItem[], opts: Partial<SimOptions> = {}): SimResult {
  const o: SimOptions = { ...DEFAULT_SIM, ...opts };
  const kept = items.filter((it) => new Set(it.fns).size >= o.minFunctions);
  // Distinct sets and the items that carry each.
  const setIndex = new Map<string, number>();
  const sets: string[][] = [];
  const setItems: string[][] = [];
  for (const it of kept) {
    const k = setKey(it.fns);
    let i = setIndex.get(k);
    if (i === undefined) {
      i = sets.length;
      setIndex.set(k, i);
      sets.push(JSON.parse(k) as string[]);
      setItems.push([]);
    }
    setItems[i]!.push(it.id);
  }
  for (const s of setItems) s.sort();
  const n = sets.length;
  const postings = new Map<string, number[]>();
  sets.forEach((s, i) => {
    for (const name of s) {
      let p = postings.get(name);
      if (!p) postings.set(name, (p = []));
      p.push(i);
    }
  });

  // Union-find over distinct sets.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const minEdge = new Map<number, number>();
  let edges = 0;
  // Best neighbouring sets per set (scores between distinct sets).
  const setNbrs: { s: number; j: number }[][] = Array.from({ length: n }, () => []);
  const counts = new Int32Array(n);
  const touched: number[] = [];
  for (let i = 0; i < n; i++) {
    const si = sets[i]!;
    for (const name of si) for (const j of postings.get(name)!) if (j !== i) {
      if (counts[j] === 0) touched.push(j);
      counts[j]!++;
    }
    for (const j of touched) {
      const inter = counts[j]!;
      counts[j] = 0;
      const jac = inter / (si.length + sets[j]!.length - inter);
      if (jac >= o.neighbourFloor) setNbrs[i]!.push({ s: j, j: jac });
      if (j > i && jac >= o.threshold) {
        edges++;
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
    touched.length = 0;
  }
  // Minimum edge score inside each component (reported so single linkage is visible).
  for (let i = 0; i < n; i++) {
    for (const { s, j } of setNbrs[i]!) {
      if (s > i && j >= o.threshold) {
        const r = find(i);
        minEdge.set(r, Math.min(minEdge.get(r) ?? 1, j));
      }
    }
  }

  const comps = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let c = comps.get(r);
    if (!c) comps.set(r, (c = []));
    c.push(i);
  }
  const clusters: Cluster[] = [];
  for (const [r, members] of comps) {
    const ids = members.flatMap((m) => setItems[m]!).sort();
    if (ids.length < 2) continue;
    clusters.push({ members: ids, distinctSets: members.length, minJ: members.length === 1 ? 1 : (minEdge.get(r) ?? 1) });
  }
  clusters.sort((a, b) => b.members.length - a.members.length || a.members[0]!.localeCompare(b.members[0]!));

  const neighbours = new Map<string, Neighbour[]>();
  for (let i = 0; i < n; i++) {
    const others: Neighbour[] = setNbrs[i]!.flatMap(({ s, j }) => setItems[s]!.map((id) => ({ id, j })));
    for (const id of setItems[i]!) {
      const same = setItems[i]!.filter((x) => x !== id).map((x) => ({ id: x, j: 1 }));
      const all = [...same, ...others].sort((a, b) => b.j - a.j || a.id.localeCompare(b.id)).slice(0, o.neighbours);
      neighbours.set(id, all);
    }
  }
  return { options: o, considered: kept.length, distinctSets: n, edges, clusters, neighbours };
}

/** A function as far as template matching needs it: name and number of inputs. */
export type FnSig = { name: string; arity: number };

/**
 * SEP-41 token interface (https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md):
 * the ten functions and their input counts. Matching is by name and arity only;
 * argument and return types are not compared.
 */
export const SEP41_FUNCTIONS: readonly FnSig[] = [
  { name: "allowance", arity: 2 },
  { name: "approve", arity: 4 },
  { name: "balance", arity: 1 },
  { name: "transfer", arity: 3 },
  { name: "transfer_from", arity: 4 },
  { name: "burn", arity: 2 },
  { name: "burn_from", arity: 3 },
  { name: "decimals", arity: 0 },
  { name: "name", arity: 0 },
  { name: "symbol", arity: 0 },
];

/** Admin functions the Stellar Asset Contract exposes in addition to SEP-41. */
export const SAC_ADMIN_FUNCTIONS: readonly FnSig[] = [
  { name: "set_admin", arity: 1 },
  { name: "admin", arity: 0 },
  { name: "set_authorized", arity: 2 },
  { name: "authorized", arity: 1 },
  { name: "mint", arity: 2 },
  { name: "clawback", arity: 2 },
];

export type TemplateLabel = "sep41" | "sep41-partial" | "sep41-sac-admin";

function hasAll(fns: FnSig[], want: readonly FnSig[]): boolean {
  return want.every((w) => fns.some((f) => f.name === w.name && f.arity === w.arity));
}

/**
 * Labels for a function list:
 * - `sep41`: all ten SEP-41 functions with the SEP's input counts;
 * - `sep41-partial`: at least seven of the ten by name (a token that drops or renames some);
 * - `sep41-sac-admin`: `sep41` plus all six SAC admin functions.
 */
export function templateLabels(fns: FnSig[]): TemplateLabel[] {
  const out: TemplateLabel[] = [];
  if (hasAll(fns, SEP41_FUNCTIONS)) {
    out.push("sep41");
    if (hasAll(fns, SAC_ADMIN_FUNCTIONS)) out.push("sep41-sac-admin");
  } else {
    const names = new Set(fns.map((f) => f.name));
    if (SEP41_FUNCTIONS.filter((w) => names.has(w.name)).length >= 7) out.push("sep41-partial");
  }
  return out;
}
