# StitchOps — Repository Structure Steering

```text
stitchops/
├── .kiro/
│   ├── steering/              # Persistent architectural & domain context
│   ├── specs/stitchops-core/  # EARS requirements, design + PBT invariants, tasks
│   ├── hooks/                 # Kiro IDE/CLI automation hooks (v1 schema)
│   ├── settings/mcp.json      # Workspace MCP integration
│   └── agents/                # Custom Kiro subagent personas
├── scripts/                   # Compliance & CLI verification scripts
├── src/
│   ├── organs/                # Pure, framework-agnostic Frankenstein organs
│   │   ├── cobol-parser.ts    # Organ 1: COBOL Copybook AST + fixed-width parser/serializer
│   │   ├── packet-verifier.ts # Organ 2: Binary telemetry frame codec + CRC-16 + FSM check
│   │   ├── schema-bridge.ts   # Organ 3: JSON Schema / OpenAPI generator + anomaly triage
│   │   └── stitch-pipeline.ts # Organ 4: Unified chimera orchestrator & replay ledger
│   ├── components/            # React UI components for the Anatomy Workbench
│   ├── data/                  # Realistic sample datasets (banking batch, corrupted frames)
│   ├── App.tsx
│   └── main.tsx
└── tests/                     # Unit + fast-check Property-Based Tests
```

## Naming Conventions
- Pure domain files use `kebab-case.ts`; React components use `PascalCase.tsx`.
- Every organ exports explicit TypeScript interfaces for input frames, output artifacts, and diagnostics.
