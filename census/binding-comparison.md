# Binding generators on our synthetic fixtures

Generated 2026-11-04T00:59:32.774Z by `scripts/compare-bindings.ts`. Fixtures are our own (`fixtures/synthetic`, made by `scripts/make-synthetic.ts`); the stellar CLI is run on them only. Type-check: `tsc --strict`, TypeScript 7, against @stellar/stellar-sdk 17.4.

| Fixture | Generator | tsc | First errors | Notes |
|---|---|---|---|---|
| full.wasm | wasm-catalog | pass |  |  |
| full.wasm | sdk BindingGenerator | pass |  |  |
| full.wasm | stellar CLI (stellar 25.2.0 (28484880988199233a7e8e87c97cb12dac323cb3)) | pass |  | no event types emitted |
| adversarial.wasm | wasm-catalog | pass |  | type "Client" emitted as Client_2; type "class" emitted as class_2; type "Promise" emitted as Promise_2; duplicate type "Dup" emitted as Dup_2 |
| adversarial.wasm | sdk BindingGenerator | fail | TS2305: Module '"./types.js"' has no exported member 'NotDeclared'.; TS2395: Individual declarations in merged declaration 'Client' must be all exported or all  |  |
| adversarial.wasm | stellar CLI (stellar 25.2.0 (28484880988199233a7e8e87c97cb12dac323cb3)) | fail | TS1128: Declaration or statement expected.; TS2427: Interface name cannot be 'class'. | struct field / argument "weird name" renamed to weird_name (runtime keys use the spec name); no event types emitted |
