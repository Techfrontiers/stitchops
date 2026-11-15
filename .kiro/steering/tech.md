# StitchOps — Technical Steering

## Stack & Runtime
- **Language**: TypeScript 5.7 (`strict: true`, `noUncheckedIndexedAccess: true`)
- **UI**: React 19 + Vite 6 + Lucide icons (clean custom CSS/variables for dark "Bio-Telemetry Lab" aesthetic—no bloated UI frameworks)
- **Testing & Verification**:
  - **Unit & Integration**: `vitest` (`npm test`)
  - **Property-Based Testing (PBT)**: `fast-check` to formally verify COBOL fixed-width round-trip preservation, binary CRC-16 corruption detection, and stitch pipeline determinism.

## Coding Standards
- **Pure Domain Organs**: Modules inside `src/organs/` MUST remain pure TypeScript with zero DOM, browser, or network side effects so they run identically in Vitest, CLI scripts, and browser Web Workers / React.
- **Discriminated Unions Over Throwing**: Parsers and verifiers return explicit `{ ok: true, value } | { ok: false, diagnostics }` results instead of throwing uncaught exceptions on malformed legacy input.
- **Zero `.kiro` Suppression**: Never ignore `.kiro/` in `.gitignore` and never commit placeholder/secret credentials.
