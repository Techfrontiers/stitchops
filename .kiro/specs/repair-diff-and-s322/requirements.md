# S322 Batch Timeout & Repair Diff — Requirements (EARS Format)

## Document Metadata
- **Feature ID**: `repair-diff-and-s322`
- **Version**: 1.0.0
- **Status**: Implementation Ready
- **Owner**: StitchOps Core Team
- **Target Organs**: Organ 4 (stitch-pipeline), Organ 3 (schema-bridge), UI (App.tsx)

---

## R1: S322 Batch Timeout Fault Injection

**WHEN** a user selects `S322_BATCH_TIMEOUT` as the fault injection mode in the StitchOps Anatomy Workbench,
**IF** the batch contains more than 1 record,
**THEN** the stitch pipeline **SHALL** inject a simulated IBM mainframe S322 batch timeout diagnostic at the first record's processing boundary.

### Acceptance Criteria
- `FaultInjectionMode` enum in `stitch-pipeline.ts` **SHALL** include `'S322_BATCH_TIMEOUT'` as a valid variant.
- When `faultMode === 'S322_BATCH_TIMEOUT'` and `autoRepair === false`, the first record **SHALL** produce a diagnostic with:
  - `code`: `'S322_BATCH_TIMEOUT'`
  - `message`: `'Batch step CPU timeout at record boundary — checkpoint stall detected'`
  - `status`: `'ABENDED'`
  - `stateHistory`: **SHALL** include `'INIT' → 'ABENDED'`
- The S322 diagnostic **SHALL** propagate to `schema-bridge.ts` triage engine and surface known signature advice.

---

## R2: S322 Auto-Repair via Checkpoint Chunking

**WHEN** `autoRepair === true` and `faultMode === 'S322_BATCH_TIMEOUT'`,
**IF** a record encounters the S322 timeout diagnostic,
**THEN** the pipeline **SHALL** simulate checkpoint-chunk partitioning recovery by:
1. Transitioning state from `'ABENDED'` to `'REPAIRED'` to `'STAGED'` to `'SETTLED'`.
2. Successfully decoding and encoding the record as if the timeout was resolved.
3. Recording a deterministic repair entry in `PipelineExecutionReport.repairDiffs[]`.

### Acceptance Criteria
- The repaired record **SHALL** reach `'SETTLED'` status.
- The FSM state sequence **SHALL** be valid: `['INIT', 'ABENDED', 'REPAIRED', 'STAGED', 'SETTLED']`.
- No CRC or fixed-width corruption **SHALL** occur during S322 recovery.

---

## R3: Deterministic Repair Diff Ledger

**WHERE** the stitch pipeline applies any auto-repair transformation (including S322, S0C7, TRUNCATE_RECORD, or future faults),
**THEN** the pipeline **SHALL** emit a structured `RepairDiffEntry` capturing:
- `recordId`: Line number or unique identifier of the repaired record.
- `fieldName`: The COBOL field name that was healed (or `'__FULL_RECORD__'` for record-level repairs like S322/truncation).
- `offsetStart`: Byte offset where the repair began within the fixed-width line.
- `offsetLength`: Number of bytes modified.
- `beforeValue`: Human-readable string representation of the corrupted/broken value before repair.
- `afterValue`: Human-readable string representation of the healed value after repair.
- `beforeHex`: Hexadecimal dump of the exact byte sequence before repair (for byte-level forensics).
- `afterHex`: Hexadecimal dump of the exact byte sequence after repair.
- `repairAction`: Machine-readable enum describing the repair operation applied (e.g., `'SANITIZE_NUMERIC'`, `'PAD_TRUNCATED'`, `'RECOVER_S322_CHECKPOINT'`).

### Acceptance Criteria
- `PipelineExecutionReport` interface **SHALL** include a new field: `repairDiffs: RepairDiffEntry[]`.
- Every repaired record **SHALL** produce at least one `RepairDiffEntry`.
- The diff **SHALL NOT** be emitted for non-repaired records (when `autoRepair === false` or no faults occur).
- The `beforeHex` and `afterHex` fields **SHALL** represent exact byte slices from the original and repaired fixed-width lines.

---

## R4: UI Panel for Surgical Repair Diff Visualization

**WHERE** the Anatomy Workbench UI displays pipeline execution results,
**IF** `report.repairDiffs.length > 0`,
**THEN** the UI **SHALL** render a dedicated "Surgical Repair Diff (Before → After)" panel showing:
- A crisp, scannable table or card layout with:
  - Record ID
  - Field name
  - Byte offset range (`offsetStart..offsetStart+offsetLength-1`)
  - Before value (human-readable + hex preview)
  - After value (human-readable + hex preview)
  - Repair action label
- The panel **SHALL** use distinct visual styling (e.g., amber/acid accent borders) to differentiate repaired records from ABENDED or SETTLED records.

### Acceptance Criteria
- The panel **SHALL** only appear when `repairDiffs.length > 0`.
- The panel **SHALL** be accessible from the main inspector tabs or as a persistent overlay.
- Hex dumps **SHALL** be formatted in clean monospace with consistent padding (e.g., `48 65 6C 6C 6F`).

---

## R5: Sample Payload for S322 Checkpointing

**WHERE** the Workbench provides realistic sample datasets,
**THEN** a new sample scenario **SHALL** be added to `src/data/samples.ts`:
- **ID**: `'insurance-claims-batch'`
- **Name**: `'Insurance Claims Batch (S322 Checkpointing)'`
- **Subtitle**: `'Long-running mainframe batch job with simulated timeout'`
- **Copybook**: A valid COBOL Copybook with at least 4 fields (mixed string + numeric).
- **Batch Lines**: At least 3 records suitable for S322 checkpoint recovery testing.

### Acceptance Criteria
- The new sample **SHALL** appear in the scenario dropdown in `App.tsx`.
- The Copybook and batch lines **SHALL** be syntactically valid and decode cleanly when no faults are injected.
- The sample **SHALL** realistically represent an insurance/claims processing legacy batch format.

---

## Non-Functional Requirements

### NFR1: Performance
- S322 fault injection and repair **SHALL NOT** increase pipeline execution time by more than 5ms per record (measured via `report.stats.executionMs`).

### NFR2: Determinism
- Running the same Copybook + batch + `faultMode='S322_BATCH_TIMEOUT'` + `autoRepair=true` combination **SHALL** produce byte-identical `repairDiffs` on every invocation.

### NFR3: Zero Regressions
- All existing fault modes (`S0C7_CORRUPTION`, `TRUNCATE_RECORD`, `BINARY_BIT_FLIP`, `FSM_BYPASS`) **SHALL** continue to function identically after S322 implementation.
- All existing unit and property-based tests **SHALL** pass without modification (except additive tests).

---

## Out of Scope
- Real-time streaming checkpoint recovery (this feature simulates batch-level timeout only).
- Distributed multi-node batch partitioning (single-process only).
- Persisting repair diffs to disk/database (in-memory report only).
