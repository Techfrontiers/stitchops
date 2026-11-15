# S322 Batch Timeout & Repair Diff — Implementation Tasks

## Task Checklist

### Phase 1: Core Pipeline & Types

- [x] **T1.1**: Extend `FaultInjectionMode` type in `stitch-pipeline.ts` to include `'S322_BATCH_TIMEOUT'`.
- [x] **T1.2**: Define `RepairDiffEntry` interface in `stitch-pipeline.ts`.
- [x] **T1.3**: Add `repairDiffs: RepairDiffEntry[]` field to `PipelineExecutionReport` interface.
- [x] **T1.4**: Implement `bufferToHex(buf: Buffer): string` utility function for hex dump generation.

### Phase 2: S322 Fault Injection Logic

- [x] **T2.1**: Add S322 fault injection case in `runStitchPipeline` for first record when `faultMode === 'S322_BATCH_TIMEOUT'`.
- [x] **T2.2**: Inject `S322_BATCH_TIMEOUT` diagnostic with proper code and message.
- [x] **T2.3**: Implement early abort path when `autoRepair === false` (ABENDED trace, no decode).
- [x] **T2.4**: Implement checkpoint recovery path when `autoRepair === true` (REPAIRED → STAGED → SETTLED FSM).
- [x] **T2.5**: Generate `RepairDiffEntry` for S322 recovery with `repairAction: 'RECOVER_S322_CHECKPOINT'`.

### Phase 3: Existing Fault Mode Repair Diff Capture

- [x] **T3.1**: Wrap existing `repairFixedWidthLine` call with before/after line capture for TRUNCATE_RECORD.
- [x] **T3.2**: Generate `RepairDiffEntry` for TRUNCATE_RECORD repairs with `repairAction: 'PAD_TRUNCATED'`.
- [x] **T3.3**: Generate `RepairDiffEntry` for S0C7_CORRUPTION repairs with `repairAction: 'SANITIZE_NUMERIC'`.
- [x] **T3.4**: Ensure `repairDiffs` array is initialized empty and populated only when repairs occur.

### Phase 4: Sample Data

- [x] **T4.1**: Add `insurance-claims-batch` sample scenario to `src/data/samples.ts`.
- [x] **T4.2**: Write valid COBOL Copybook for insurance claims with 4+ fields.
- [x] **T4.3**: Write 3 realistic batch lines matching the Copybook schema.
- [x] **T4.4**: Verify new sample decodes cleanly when `faultMode === 'NONE'`.

### Phase 5: UI Integration

- [x] **T5.1**: Add `'S322_BATCH_TIMEOUT'` to `FAULT_OPTIONS` array in `App.tsx`.
- [x] **T5.2**: Extend `InspectorTab` type to include `'repairs'`.
- [x] **T5.3**: Add "Surgical Repair Diffs" tab button with count badge.
- [x] **T5.4**: Render repair diff panel with Before/After comparison cards.
- [x] **T5.5**: Style repair diff cards with amber accent border and distinct background.
- [x] **T5.6**: Display hex dumps with proper monospace formatting and spacing.
- [x] **T5.7**: Disable repairs tab when `report.repairDiffs.length === 0`.

### Phase 6: Testing

- [x] **T6.1**: Write unit test for S322 fault without repair (ABENDED, no decode).
- [x] **T6.2**: Write unit test for S322 fault with repair (SETTLED, valid FSM).
- [x] **T6.3**: Write unit test verifying S322 triage advice appears in `report.triage`.
- [x] **T6.4**: Write unit test for TRUNCATE_RECORD repair diff capture.
- [x] **T6.5**: Write unit test for S0C7_CORRUPTION repair diff capture.
- [x] **T6.6**: Write fast-check property test for P6 (S322 repair determinism).
- [x] **T6.7**: Write fast-check property test for P7 (repair diff completeness).
- [x] **T6.8**: Verify all existing tests pass without modification.

### Phase 7: Verification & Cleanup

- [x] **T7.1**: Run `npm run typecheck` and fix any TypeScript errors.
- [x] **T7.2**: Run `npm test` and ensure all tests pass.
- [x] **T7.3**: Run `npm run stitch` and verify CLI still works with examples.
- [x] **T7.4**: Run `npm run check:kiro` and fix any compliance violations.
- [x] **T7.5**: Run `npm run build` and ensure production build succeeds.
- [x] **T7.6**: Manually test all 3 sample scenarios in dev server with S322 fault mode.
- [x] **T7.7**: Verify repair diff panel renders correctly for all fault modes with autoRepair.
- [x] **T7.8**: Remove any temporary debug logs or commented code.

---

## Completion Criteria

✅ All tasks above marked with `[x]` and all npm scripts exit with code 0.

## Implementation Summary

Successfully implemented S322 batch timeout fault injection with checkpoint recovery simulation and comprehensive repair diff ledger. The feature includes:

- **New fault mode**: `S322_BATCH_TIMEOUT` simulates IBM mainframe batch step CPU timeout
- **Auto-repair mechanism**: When enabled, transitions through `ABENDED → REPAIRED → STAGED → SETTLED` FSM states
- **Repair diff ledger**: Captures byte-level before/after transformations for all repair operations
- **UI enhancement**: New "Surgical Repair Diffs" panel with split-view hex dumps
- **New sample**: Insurance claims batch processing scenario with 34-byte fixed-width records
- **Test coverage**: 7 new unit tests + 2 property-based tests (P6, P7) verifying determinism and completeness
- **Zero regressions**: All existing tests pass, all verification scripts exit cleanly

The implementation preserves full backward compatibility while adding powerful forensic capabilities for mainframe operations debugging.

