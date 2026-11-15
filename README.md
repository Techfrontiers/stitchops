# StitchOps

> **Kiroween 2026 — Category: Frankenstein**  
> Stitching a **COBOL Mainframe Batch Parser**, a **Binary Telemetry & Bytecode Verifier**, a **SQLite/Ledger Replay Engine**, and a **Real-Time AI-Assisted Anatomy Workbench** into one cohesive operations pipeline.

## Why StitchOps? (The Frankenstein Chimera)
Legacy enterprise systems still emit fixed-width mainframe records (`COBOL COPYBOOK` layouts), cryptic `ABEND` dump codes, and raw binary telemetry alongside modern JSON/REST microservices. Usually, teams maintain fragile glue scripts across separate tools.

**StitchOps** stitches four disparate worlds into a single live workbench:
1. **Mainframe Organ (`cobol-parser`)** — Parses COBOL `PIC` copybook schemas & fixed-width batch records deterministically with zero external native dependencies.
2. **Binary Telemetry Organ (`packet-verifier`)** — Validates binary frame headers, CRC/checksums, and state-machine transitions using strict invariants.
3. **Alchemist Organ (`schema-bridge`)** — Synthesizes typed OpenAPI/JSON contracts, transforms legacy records cleanly, and explains batch/abend anomalies with guided remediation patches.
4. **Anatomy Workbench (`web` + `cli`)** — Live dark-mode Operations Lab displaying organ heartbeats, stitch pipelines, diff inspector, and replay controls.

## Kiro-First Workflow (`/.kiro`)
This repository uses Kiro spec-driven development and automation:
- **Steering (`.kiro/steering/`)**: `product.md`, `tech.md`, `structure.md`
- **Specs (`.kiro/specs/stitchops-core/`)**: EARS `requirements.md`, PBT-backed `design.md`, dependency-ordered `tasks.md`
- **Hooks (`.kiro/hooks/`)**: Automated test-on-save & `.kiro/` Git guardrails
- **MCP (`.kiro/settings/mcp.json`)**: Workspace MCP integration
- **Custom Agent (`.kiro/agents/organ-surgeon.json`)**: Specialized agent persona for cross-organ contract verification

## Quick Start
```bash
npm install
npm test
npm run stitch -- --copybook examples/treasury.cpy --batch examples/treasury.dat
npm run dev
```

### CLI Options
```bash
node scripts/stitchops-cli.ts --copybook examples/treasury.cpy --batch examples/treasury.dat --fault S0C7_CORRUPTION --repair --out-openapi openapi.json
```

## License
[MIT](./LICENSE)
