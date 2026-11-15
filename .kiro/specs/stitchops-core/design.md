# StitchOps Core — Technical Design

## Architecture Overview

StitchOps connects four isolated "organs" through typed envelopes inside `src/organs/`:

```text
[COBOL Copybook + Batch Text]
          │
          ▼  (Organ 1: cobol-parser.ts)
   Typed Copybook AST + Decoded Records / Diagnostics
          │
          ▼  (Organ 2: packet-verifier.ts)
   Binary Frames ([0x53,0x54] + seq + len + payload + CRC-16) + FSM Audit
          │
          ▼  (Organ 3: schema-bridge.ts)
   JSON Schema 2020-12 + ABEND / Corruption Triage & Repair Patches
          │
          ▼  (Organ 4: stitch-pipeline.ts)
   Unified PipelineTrace + Organ Heartbeat Metrics -> React Anatomy Workbench
```

## Organ Contracts & Data Models

### 1. `cobol-parser.ts`
- `CopybookField`: `{ name, level, picRaw, kind: 'string' | 'int' | 'decimal', length, scale, signed, offset }`
- `parseCopybook(source: string): Result<CopybookSchema, CopybookDiagnostic[]>`
- `decodeRecord(schema: CopybookSchema, line: string): Result<Record<string, string | number>, RecordDiagnostic[]>`
- `encodeRecord(schema: CopybookSchema, record: Record<string, string | number>): Result<string, RecordDiagnostic[]>`

### 2. `packet-verifier.ts`
- Frame Layout (Big-Endian):
  - Bytes `0..1`: Magic `[0x53, 0x54]` (`"ST"`)
  - Byte `2`: Protocol version (`0x01`)
  - Bytes `3..6`: `uint32` sequence number
  - Bytes `7..8`: `uint16` payload byte length
  - Bytes `9..(9+len-1)`: UTF-8 JSON payload
  - Last 2 bytes: `uint16` CRC-16/XMODEM computed over bytes `0..(9+len-1)`
- FSM Lifecycle Guard: `INIT -> STAGED -> SETTLED | ABENDED`, and `ABENDED -> REPAIRED -> STAGED`.

### 3. `schema-bridge.ts`
- Generates `JSONSchema2020` object + `OpenAPI 3.1` component snippet directly from `CopybookSchema`.
- Pattern-matches diagnostics (`S0C7`, `S0C4`, `S322`, `RECORD_WIDTH_MISMATCH`, `CRC_MISMATCH`, `FSM_VIOLATION`) to deterministic triage cards + one-click patch functions.

### 4. `stitch-pipeline.ts`
- Orchestrates batch execution, collects per-organ latency/health telemetry, supports deterministic fault injection (`corruptPayloadBit`, `truncateBatchLine`, `injectS0C7`), and records repair replay diffs.

---

## Correctness Properties (Property-Based Testing via `fast-check`)

1. **Property P1 — Copybook Round-Trip Preservation**:
   For any valid `CopybookSchema` and any randomly generated conformant record matching its `PIC` widths and decimal scales, `decodeRecord(schema, encodeRecord(schema, rec))` MUST succeed and yield values numerically and lexically equal to `rec` (with `PIC X` normalized by trailing whitespace trimming).
2. **Property P2 — Exact Byte Width Invariant**:
   For every successfully encoded record under `schema`, `encoded.length === schema.totalWidth`.
3. **Property P3 — Single-Bit Corruption Detection (CRC-16)**:
   For any valid payload bytes and any single bit index `b` flipped inside the encoded telemetry frame (`[0 .. frame.length * 8 - 1]`), `decodeTelemetryFrame(corruptedFrame)` MUST return `{ ok: false }` (catching magic corruption, length mismatch, or `CRC_MISMATCH`).
4. **Property P4 — FSM Illegal Transition Rejection**:
   Any event sequence transitioning directly from `ABENDED` to `SETTLED` without an intervening `REPAIRED` state MUST produce an `FSM_VIOLATION` diagnostic.
