// SPDX-License-Identifier: Apache-2.0
// Shapes of web/public/data, written by ../scripts/web-data.ts (src/webdata.ts).
// Kept in step with that module; test/webdata.test.ts checks the shipped files.

export type TemplateLabel = 'sep41' | 'sep41-partial' | 'sep41-sac-admin';

export interface WebRow {
  h: string;
  n: number;
  sz: number | null;
  sp: boolean | null;
  f: number | null;
  t: number | null;
  e: number | null;
  ev: number | null;
  p: number | null;
  sdk: string | null;
  rs: string | null;
  sep: string[];
  repo: string | null;
  s58: 'conformant' | 'non-conformant' | null;
  tc: 'pass' | 'fail' | null;
  sg: 'pass' | 'fail' | null;
  gi: number | null;
  gs: number | null;
  gc: number | null;
  nc: number | null;
  lab: TemplateLabel[];
  fns: string[];
  cr: string | null;
}

export interface WebIndex {
  format: string;
  generatedAt: string;
  count: number;
  rows: WebRow[];
}

export interface SpecJson {
  format?: string;
  generator?: string;
  hash?: string;
  size?: number;
  codeSha256?: string;
  customSectionNames?: string[];
  spec?: { present?: boolean; sectionCount?: number; bytes?: number; entries?: unknown[] };
  meta?: { present?: boolean; entries?: { key: string; val: string }[]; sdkVersion?: string; rustVersion?: string; sdkCommit?: string };
  envMeta?: { present?: boolean; entries?: { protocol: number; preRelease: number }[] };
}

export interface HashDetail {
  spec: SpecJson | null;
  bindings: string | null;
  diagnostics: string[];
  tcErrors: string[];
  sdkErrors: string[];
  contracts: string[];
  contractCount: number;
  created: { first: string | null; last: string | null };
  neighbours: { h: string; j: number }[];
  fetch: string | null;
  sources: string[];
  lastModifiedLedger: number | null;
}

export interface Group {
  id: number;
  size: number;
  contracts: number;
  sdkVersions: string[];
  members: string[];
  shared?: string[];
  unionSize?: number;
  minJ?: number;
  distinctSets?: number;
}

export interface Measure {
  hashes: number;
  contracts: number;
  method?: string;
}

export interface Summary {
  format: string;
  exportedAt: string;
  provenance: {
    kind: 'recorded';
    network: 'mainnet';
    latestLedger: number;
    oldestLedger: number | null;
    harvestedAt: string;
    builtAt: string;
    generator: string;
    rpcUrl: string;
    rpcVersion: { version?: string; protocolVersion?: number; captiveCoreVersion?: string } | null;
    listing: string;
    sePages: number;
    selection: string;
  };
  totals: {
    contracts: number;
    contractsWithHash: number;
    hashes: number;
    withSpec: number;
    bindings: number;
    oursPass: number;
    oursFail: number;
    sdkPass: number;
    sdkFail: number;
    topHash: { hash: string; contracts: number; functions: number | null; sdkVersion: string | null } | null;
  };
  created: {
    source: string;
    contractsWithDate: number;
    contractsWithoutDate: number;
    byMonth: { month: string; contracts: number; newHashes: number }[];
  };
  groups: {
    sameInterface: { groups: number; hashes: number; top: Group[] };
    sameSpec: { groups: number; hashes: number; top: Group[] };
    sameCode: { groups: number; hashes: number; top: Group[] };
    near: {
      method: string;
      options: { threshold: number; minFunctions: number; neighbours: number; neighbourFloor: number };
      considered: number;
      distinctSets: number;
      edges: number;
      clusters: number;
      hashes: number;
      top: Group[];
    };
  };
  seps: {
    contractsWithHash: number;
    sep41: Measure;
    sep41Partial: Measure;
    sep41SacAdmin: Measure;
    sep48Events: Measure;
    sep47Declared: Measure & { seps: Record<string, number> };
    sep55SourceRepo: Measure & { hosts: Record<string, number> };
    sep58Conformant: Measure;
    sep58NonConformant: Measure;
  };
  coverage: Coverage;
}

export interface Coverage {
  generatedAt: string;
  sdkVersion: string;
  harvest: {
    generatedAt: string;
    rpcUrl: string;
    latestLedger: number;
    oldestLedger: number;
    sePages: number;
    eventWindows: number;
    eventsRead: number;
    net: { live: number; cached: number; retries: number; bytes: number };
    crossCheck: { checked: number; agree: number; disagree: number };
  };
  contracts: { total: number; bySource: Record<string, number>; seListingNoWasm: number; rpcExecutable: Record<string, number>; withWasmHash: number };
  hashes: {
    seen: number;
    contractsPerHash: Record<string, number>;
    mostUsed: { hash: string; contracts: number; functions: number | null; sdkVersion: string | null }[];
    fetch: Record<string, number>;
    sizeBytes: { min: number; max: number; total: number };
  };
  sections: {
    specPresent: number;
    specEmpty: number;
    withEvents: number;
    metaPresent: number;
    envMetaPresent: number;
    protocols: Record<string, number>;
    sdkMajor: Record<string, number>;
    sep47Declared: number;
    sep55SourceRepo: number;
    sep58: Record<string, number>;
  };
  bindings: {
    generated: number;
    withDiagnostics: number;
    hashesByDiagnosticClass: Record<string, number>;
    typecheck: { pass: number; fail: number; errorCodes: Record<string, number> } | null;
    sdkGenerator: { pass: number; fail: number; errorCodes: Record<string, number> } | null;
  };
}
