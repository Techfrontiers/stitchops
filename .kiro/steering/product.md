# StitchOps — Product Steering

## Vision
StitchOps is a **Kiroween 2026 (Category: Frankenstein)** application that stitches seemingly incompatible operational technologies—**COBOL mainframe Copybooks & fixed-width batch dumps**, **low-level binary telemetry frames (CRC-16/XMODEM + state machine)**, **automated JSON/OpenAPI contract synthesis**, and a **live browser Anatomy Workbench**—into one cohesive, zero-surprise operations pipeline.

## Core User Personas
1. **Mainframe Migration Engineer**: Needs deterministic parsing of `PIC X`, `PIC 9`, and implied-decimal `PIC 9(...)V99` COBOL fields without risking silent truncation or off-by-one byte shifts.
2. **Systems / Incident Responder**: Needs instant visual inspection of corrupted binary telemetry frames, checksum mismatches, and mainframe `ABEND` codes (`S0C7`, `S0C4`, `S322`) alongside synthesized remediation diffs.

## Non-Negotiable Product Invariants
- **No Silent Data Loss**: Every byte offset, field overflow, or CRC mismatch must surface an explicit structured diagnostic rather than silently coercing or dropping values.
- **Deterministic Round-Tripping**: Valid parsed records serialized back to fixed-width / binary payloads must preserve exact field semantics and checksums.
- **Local-First & Zero-Backend-Required Demo**: All core organs (`cobol-parser`, `packet-verifier`, `schema-bridge`, `triage-engine`) run deterministically in TypeScript both in browser and in Node/Vitest, while optional live CLI/MCP adapters extend them cleanly.
