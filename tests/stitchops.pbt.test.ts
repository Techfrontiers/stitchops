import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeRecord, encodeRecord, parseCopybook } from '../src/organs/cobol-parser.ts';
import {
  decodeTelemetryFrame,
  encodeTelemetryFrame,
  flipBit,
  verifyStateSequence,
  type OperationalState,
} from '../src/organs/packet-verifier.ts';
import { SAMPLE_SCENARIOS } from '../src/data/samples.ts';
import { runStitchPipeline } from '../src/organs/stitch-pipeline.ts';

describe('StitchOps — Property-Based & Organ Invariant Tests', () => {
  it('Property P1 & P2: COBOL Copybook encode/decode round-trip and exact byte width', () => {
    const sample = SAMPLE_SCENARIOS[0]!;
    const parsed = parseCopybook(sample.copybook);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const schema = parsed.value;

    const asciiSafeChar = fc.constantFrom(
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split(''),
    );
    const boundedText = (maxLen: number) =>
      fc
        .array(asciiSafeChar, { minLength: 1, maxLength: maxLen })
        .map((chars) => chars.join('').replace(/\s+$/, ''));

    const recordArb = fc.record({
      'TX-ID': boundedText(8),
      'ACCT-CODE': boundedText(6),
      'CHANNEL-NUM': fc.integer({ min: 0, max: 9999 }),
      'SETTLE-AMT': fc
        .integer({ min: -99999999, max: 99999999 })
        .map((cents) => Number((cents / 100).toFixed(2))),
      'CURRENCY-CD': boundedText(3),
    });

    fc.assert(
      fc.property(recordArb, (record) => {
        const encoded = encodeRecord(schema, record);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;

        // Property P2: exact width invariant
        expect(encoded.value.length).toBe(schema.totalWidth);

        // Property P1: round-trip semantic preservation
        const decoded = decodeRecord(schema, encoded.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;

        expect(decoded.value).toEqual(record);
      }),
      { numRuns: 200 },
    );
  });

  it('Property P3: Binary telemetry CRC-16 detects every single-bit flip in header or payload', () => {
    const payloadArb = fc.record({
      txId: fc.string({ minLength: 1, maxLength: 16 }),
      amountCents: fc.integer({ min: -1_000_000, max: 1_000_000 }),
      seq: fc.integer({ min: 0, max: 10_000 }),
    });

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0xffffffff }), payloadArb, fc.nat(), (seq, payload, seed) => {
        const frame = encodeTelemetryFrame(seq, payload);

        // Clean frame always decodes back to exact payload
        const clean = decodeTelemetryFrame(frame);
        expect(clean.ok).toBe(true);
        if (clean.ok) {
          expect(clean.value.payload).toEqual(payload);
          expect(clean.value.sequenceId).toBe(seq >>> 0);
        }

        // Flip any single bit anywhere inside the frame
        const corrupted = flipBit(frame, seed % (frame.length * 8));
        const rejected = decodeTelemetryFrame(corrupted);
        expect(rejected.ok).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('Property P4: Operational FSM rejects ABENDED -> SETTLED without REPAIRED gate', () => {
    const illegalSequence: OperationalState[] = ['INIT', 'STAGED', 'ABENDED', 'SETTLED'];
    const result = verifyStateSequence(illegalSequence);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('FSM_VIOLATION');
    }

    const validRepairedSequence: OperationalState[] = [
      'INIT',
      'STAGED',
      'ABENDED',
      'REPAIRED',
      'STAGED',
      'SETTLED',
    ];
    expect(verifyStateSequence(validRepairedSequence)).toEqual({ ok: true });
  });

  it('End-to-end sample workloads pass cleanly and recover from S0C7 corruption under autoRepair', () => {
    for (const scenario of SAMPLE_SCENARIOS) {
      const cleanReport = runStitchPipeline({
        copybookSource: scenario.copybook,
        batchLines: scenario.batchLines,
      });
      expect(cleanReport.ok).toBe(true);
      expect(cleanReport.stats.settledCount).toBe(3);
      expect(cleanReport.stats.abendedCount).toBe(0);
    }

    const first = SAMPLE_SCENARIOS[0]!;
    const broken = runStitchPipeline({
      copybookSource: first.copybook,
      batchLines: first.batchLines,
      faultMode: 'S0C7_CORRUPTION',
    });
    expect(broken.ok).toBe(false);
    expect(broken.triage.some((t) => t.signature === 'S0C7')).toBe(true);

    const repaired = runStitchPipeline({
      copybookSource: first.copybook,
      batchLines: first.batchLines,
      faultMode: 'S0C7_CORRUPTION',
      autoRepair: true,
    });
    expect(repaired.ok).toBe(true);
    expect(repaired.traces[0]?.stateHistory).toEqual([
      'INIT',
      'ABENDED',
      'REPAIRED',
      'STAGED',
      'SETTLED',
    ]);
  });
});
