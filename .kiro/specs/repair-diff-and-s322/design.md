# S322 Batch Timeout & Repair Diff — Design Document

## Document Metadata
- **Feature ID**: `repair-diff-and-s322`
- **Version**: 1.0.0
- **Status**: Implementation Ready
- **Dependencies**: `stitch-pipeline.ts`, `schema-bridge.ts`, `App.tsx`, `samples.ts`

---

## Architecture Overview

This feature extends Organ 4 (stitch-pipeline) to support S322 batch timeout simulation and introduces a deterministic repair diff ledger that captures byte-level before/after transformations when `autoRepair` heals corrupted records. The design preserves existing fault injection behavior while adding additive, backward-compatible enhancements.

---

## TypeScript Interface Definitions

### RepairDiffEntry (New Type)

```typescript
export interface RepairDiffEntry {
  /**
   * Record line number (1-indexed) that was repaired.
   */
  recordId: number;

  /**
   * COBOL field name that was healed.
   * Use '__FULL_RECORD__' for record-level repairs (S322, TRUNCATE_RECORD).
   */
  fieldName: string;

  /**
   * Starting byte offset within the fixed-width line where repair began.
   */
  offsetStart: number;

  /**
   * Number of bytes modified during repair.
   */
  offsetLength: number;

  /**
   * Human-readable string representation before repair.
   */
  beforeValue: string;

  /**
   * Human-readable string representation after repair.
   */
  afterValue: string;

  /**
   * Hexadecimal dump of the exact byte sequence before repair.
   * Format: space-separated uppercase hex pairs (e.g., "48 65 6C 6C 6F").
   */
  beforeHex: string;

  /**
   * Hexadecimal dump of the exact byte sequence after repair.
   * Format: space-separated uppercase hex pairs.
   */
  afterHex: string;

  /**
   * Machine-readable repair operation identifier.
   */
  repairAction: 'SANITIZE_NUMERIC' | 'PAD_TRUNCATED' | 'RECOVER_S322_CHECKPOINT';
}
```

### PipelineExecutionReport (Extended)

```typescript
export interface PipelineExecutionReport {
  ok: boolean;
  schema?: CopybookSchema;
  copybookDiagnostics: CopybookDiagnostic[];
  contract?: GeneratedContract;
  traces: StitchedRecordTrace[];
  triage: TriageAdvice[];
  organs: OrganHeartbeat[];
  stats: {
    totalRecords: number;
    settledCount: number;
    abendedCount: number;
    executionMs: number;
  };
  
  /**
   * NEW: Deterministic repair diff ledger capturing byte-level transformations.
   * Empty array when autoRepair=false or no faults occur.
   */
  repairDiffs: RepairDiffEntry[];
}
```

### FaultInjectionMode (Extended)

```typescript
export type FaultInjectionMode =
  | 'NONE'
  | 'S0C7_CORRUPTION'
  | 'TRUNCATE_RECORD'
  | 'BINARY_BIT_FLIP'
  | 'FSM_BYPASS'
  | 'S322_BATCH_TIMEOUT'; // NEW
```

---

## Implementation Strategy

### 1. Extend `stitch-pipeline.ts`

#### 1.1 Add S322 Fault Injection Logic

In `runStitchPipeline`, when processing the **first record** (index === 0) and `faultMode === 'S322_BATCH_TIMEOUT'`:

1. Before attempting `decodeRecord`, inject a synthetic S322 diagnostic:
   ```typescript
   if (faultMode === 'S322_BATCH_TIMEOUT' && index === 0) {
     stateHistory.push('ABENDED');
     const s322Diag = {
       code: 'S322_BATCH_TIMEOUT',
       message: 'Batch step CPU timeout at record boundary — checkpoint stall detected',
     };
     diagnostics.push(s322Diag);
     anomalyTokens.push(`${s322Diag.code} ${s322Diag.message}`);
     
     if (!autoRepair) {
       // Abort without decoding
       abendedCount += 1;
       traces.push({ /* ABENDED trace */ });
       return; // early exit from forEach iteration
     }
   }
   ```

2. **If `autoRepair === true`**: Simulate checkpoint recovery by transitioning states and allowing normal decode/encode flow:
   ```typescript
   if (autoRepair) {
     stateHistory.push('REPAIRED', 'STAGED');
     // Create repair diff entry
     repairDiffs.push({
       recordId: seq,
       fieldName: '__FULL_RECORD__',
       offsetStart: 0,
       offsetLength: workingLine.length,
       beforeValue: '(Timed-out batch record)',
       afterValue: workingLine,
       beforeHex: '', // No bytes were corrupted—timeout is external
       afterHex: bufferToHex(Buffer.from(workingLine, 'utf-8')),
       repairAction: 'RECOVER_S322_CHECKPOINT',
     });
     // Continue normal decode flow
   }
   ```

#### 1.2 Extend Existing Repair Logic

For existing repair cases (`TRUNCATE_RECORD`, `S0C7_CORRUPTION`), wrap the `repairFixedWidthLine` call with diff capture:

```typescript
if (!decodedResult.ok && autoRepair) {
  const beforeLine = workingLine;
  stateHistory.push('ABENDED', 'REPAIRED');
  workingLine = repairFixedWidthLine(schema, workingLine);
  
  // Capture diff
  repairDiffs.push({
    recordId: seq,
    fieldName: '__FULL_RECORD__',
    offsetStart: 0,
    offsetLength: Math.max(beforeLine.length, workingLine.length),
    beforeValue: beforeLine,
    afterValue: workingLine,
    beforeHex: bufferToHex(Buffer.from(beforeLine, 'utf-8')),
    afterHex: bufferToHex(Buffer.from(workingLine, 'utf-8')),
    repairAction: faultMode === 'TRUNCATE_RECORD' ? 'PAD_TRUNCATED' : 'SANITIZE_NUMERIC',
  });
  
  decodedResult = decodeRecord(schema, workingLine);
}
```

#### 1.3 Add Utility Function for Hex Conversion

```typescript
function bufferToHex(buf: Buffer): string {
  return Array.from(buf)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}
```

---

### 2. Extend `schema-bridge.ts`

The S322 signature is already defined in `KNOWN_SIGNATURES`, so no changes are strictly required. However, verify that the triage advice is clear:

```typescript
S322: {
  severity: 'warning',
  organ: 'schema-bridge',
  title: 'IBM S322 Batch Step CPU Timeout',
  rootCause: 'Long-running batch loop stalled prior to checkpoint commit.',
  remediation: 'Split monolithic batch file into chunked telemetry frames (<= 1,000 records/frame).',
  patchHint: 'Chunk stream and resume from last SETTLED sequence ID.',
}
```

This is already correctly configured, so no code changes needed in `schema-bridge.ts`.

---

### 3. Add Sample to `samples.ts`

```typescript
{
  id: 'insurance-claims-batch',
  name: 'Insurance Claims Batch Processing (S322 Checkpointing)',
  subtitle: 'Long-running legacy batch with checkpoint recovery simulation',
  copybook: `       01  CLAIM-BATCH-REC.
           05  CLAIM-ID         PIC X(10).
           05  POLICY-NUM       PIC X(12).
           05  CLAIM-AMT        PIC S9(7)V99.
           05  STATUS-CODE      PIC X(2).`,
  batchLines: [
    'CLM0000001POL-88901234+00125050AC',
    'CLM0000002POL-88901235-00004525RE',
    'CLM0000003POL-88901236+00500000SE',
  ].join('\n'),
}
```

---

### 4. Extend `App.tsx` UI

#### 4.1 Add S322 to Fault Options

```typescript
const FAULT_OPTIONS: Array<{ value: FaultInjectionMode; label: string }> = [
  { value: 'NONE', label: 'No Fault (Healthy Batch)' },
  { value: 'S0C7_CORRUPTION', label: 'Inject S0C7 Data Exception (?X bytes)' },
  { value: 'TRUNCATE_RECORD', label: 'Inject Truncated Record Width' },
  { value: 'BINARY_BIT_FLIP', label: 'Inject Binary CRC-16 Bit-Flip' },
  { value: 'FSM_BYPASS', label: 'Inject Illegal FSM Bypass (ABENDED -> SETTLED)' },
  { value: 'S322_BATCH_TIMEOUT', label: 'Inject S322 Batch Timeout (Checkpoint Recovery)' }, // NEW
];
```

#### 4.2 Add Repair Diff Panel

After the existing trace/hex/schema tabs, add a new tab for repair diffs:

```typescript
type InspectorTab = 'traces' | 'hex' | 'schema' | 'repairs'; // NEW

// In JSX after schema tab button:
<button
  type="button"
  className={`action-btn ${activeTab === 'repairs' ? 'active-acid' : ''}`}
  onClick={() => setActiveTab('repairs')}
  disabled={report.repairDiffs.length === 0}
>
  <Wrench size={15} />
  Surgical Repair Diffs ({report.repairDiffs.length})
</button>
```

#### 4.3 Render Repair Diff Content

```typescript
{activeTab === 'repairs' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {report.repairDiffs.map((diff, idx) => (
      <div key={idx} className="trace-card" style={{ borderColor: 'var(--amber)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>
            Record #{diff.recordId} · Field: {diff.fieldName}
          </strong>
          <span
            style={{
              background: 'rgba(245, 185, 66, 0.14)',
              color: 'var(--amber)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontFamily: 'var(--mono)',
              textTransform: 'uppercase',
            }}
          >
            {diff.repairAction}
          </span>
        </div>

        <div className="organ-meta" style={{ marginTop: 4 }}>
          Byte Range: {diff.offsetStart}..{diff.offsetStart + diff.offsetLength - 1} ({diff.offsetLength} bytes)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>
              ❌ Before Repair
            </div>
            <pre className="mono-box" style={{ background: 'rgba(255, 77, 109, 0.08)' }}>
              {diff.beforeValue}
              {diff.beforeHex && `\n\nHex: ${diff.beforeHex}`}
            </pre>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>
              ✅ After Repair
            </div>
            <pre className="mono-box" style={{ background: 'rgba(56, 242, 158, 0.08)' }}>
              {diff.afterValue}
              {diff.afterHex && `\n\nHex: ${diff.afterHex}`}
            </pre>
          </div>
        </div>
      </div>
    ))}
  </div>
)}
```

---

## Correctness Properties

### P6: S322 Repair Determinism

**Property**: For any valid Copybook `C` and batch `B` with `|B| > 0`, running:
```typescript
runStitchPipeline({ copybookSource: C, batchLines: B, faultMode: 'S322_BATCH_TIMEOUT', autoRepair: true })
```
twice in succession **SHALL** produce byte-identical `repairDiffs` arrays.

**Verification**: fast-check property test comparing `JSON.stringify(report1.repairDiffs) === JSON.stringify(report2.repairDiffs)`.

---

### P7: Repair Diff Completeness

**Property**: For any pipeline execution where `report.traces.some(t => t.stateHistory.includes('REPAIRED'))`, the following invariant **SHALL** hold:
```typescript
report.repairDiffs.length > 0
```
i.e., every repaired record **MUST** produce at least one `RepairDiffEntry`.

**Verification**: Unit test asserting `repairDiffs.length > 0` for all fault modes with `autoRepair=true`.

---

## Testing Strategy

### Unit Tests

1. **S322 Fault Without Repair**: Verify first record ABENDs with S322 diagnostic and `autoRepair=false`.
2. **S322 Fault With Repair**: Verify first record reaches SETTLED with FSM sequence `['INIT', 'ABENDED', 'REPAIRED', 'STAGED', 'SETTLED']`.
3. **Repair Diff Capture**: For TRUNCATE_RECORD + autoRepair, assert `repairDiffs[0].repairAction === 'PAD_TRUNCATED'`.
4. **S322 Triage**: Assert `report.triage.some(t => t.signature === 'S322')`.

### Property-Based Tests (fast-check)

1. **P6 Determinism**: Run identical pipeline configurations twice and assert `repairDiffs` arrays are deep-equal.
2. **P7 Completeness**: For arbitrary valid Copybooks + random fault modes, assert `repaired records => repairDiffs.length > 0`.

---

## Migration & Backward Compatibility

- **Zero Breaking Changes**: All existing `PipelineExecutionReport` consumers will see `repairDiffs: []` by default (when `autoRepair=false`).
- **Additive Only**: New `FaultInjectionMode` variant and `RepairDiffEntry` type do not alter existing code paths.
- **CSS Safety**: New UI panel uses existing CSS variables and classes; no global style conflicts.

---

## Open Questions (Resolved)

1. **Q**: Should repair diffs capture field-level granularity for S0C7 repairs?  
   **A**: Not in v1.0.0—use `'__FULL_RECORD__'` for simplicity. Field-level diffs are future enhancement.

2. **Q**: Should S322 trigger on records other than the first?  
   **A**: No—simulate single checkpoint timeout at batch start for simplicity.

3. **Q**: Should hex dumps include ASCII preview?  
   **A**: No—keep hex-only for byte-level forensics. UI can optionally render ASCII separately in future.
