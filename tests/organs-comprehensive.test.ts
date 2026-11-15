import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_SCENARIOS } from '../src/data/samples.ts';
import { parseCopybook } from '../src/organs/cobol-parser.ts';
import {
  CRC_SIZE,
  decodeTelemetryFrame,
  encodeTelemetryFrame,
  HEADER_SIZE,
} from '../src/organs/packet-verifier.ts';
import { synthesizeSchema } from '../src/organs/schema-bridge.ts';
import { runStitchPipeline } from '../src/organs/stitch-pipeline.ts';

describe('StitchOps — Comprehensive Organ, Schema & CLI Verification', () => {
  it('Property P5: Synthesizes exact JSON Schema / OpenAPI contracts from arbitrary valid Copybooks', () => {
    const fieldSpecArb = fc.uniqueArray(
      fc.record({
        suffix: fc.integer({ min: 10, max: 99 }),
        kind: fc.constantFrom<'X' | '9' | '9V' | 'S9V'>('X', '9', '9V', 'S9V'),
        digits: fc.integer({ min: 1, max: 6 }),
        scale: fc.integer({ min: 1, max: 3 }),
      }),
      { minLength: 1, maxLength: 6, selector: (item) => item.suffix },
    );

    fc.assert(
      fc.property(fieldSpecArb, (specs) => {
        const lines = ['       01  ARB-GEN-REC.'];
        for (const spec of specs) {
          const pic =
            spec.kind === 'X'
              ? `PIC X(${spec.digits})`
              : spec.kind === '9'
                ? `PIC 9(${spec.digits})`
                : spec.kind === '9V'
                  ? `PIC 9(${spec.digits})V9(${spec.scale})`
                  : `PIC S9(${spec.digits})V9(${spec.scale})`;
          lines.push(`           05  FLD-${spec.suffix}   ${pic}.`);
        }

        const parsed = parseCopybook(lines.join('\n'));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

        const contract = synthesizeSchema(parsed.value);
        expect(contract.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
        expect(contract.required.length).toBe(parsed.value.fields.length);

        let runningOffset = 0;
        for (const field of parsed.value.fields) {
          const prop = contract.properties[field.name];
          expect(prop).toBeDefined();
          expect(prop?.['x-cobol-offset']).toBe(runningOffset);
          expect(prop?.['x-cobol-width']).toBe(field.width);
          runningOffset += field.width;
        }
        expect(runningOffset).toBe(parsed.value.totalWidth);
      }),
      { numRuns: 100 },
    );
  });

  it('Emits structured diagnostics for invalid Copybooks without throwing', () => {
    const badPic = parseCopybook('01 TEST-REC.\n05 BAD-FLD PIC ZZZ.');
    expect(badPic.ok).toBe(false);
    if (!badPic.ok) {
      expect(badPic.diagnostics[0]?.code).toBe('UNSUPPORTED_PIC');
      expect(badPic.diagnostics[0]?.line).toBe(2);
    }

    const empty = parseCopybook('   * ONLY COMMENT\n   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.diagnostics[0]?.code).toBe('EMPTY_COPYBOOK');
    }
  });

  it('Detects short frames, bad magic bytes, unsupported versions, and declared length mismatches', () => {
    expect(decodeTelemetryFrame(new Uint8Array([0x53, 0x54]))).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'FRAME_TOO_SHORT' }],
    });

    const valid = encodeTelemetryFrame(7, { ok: true });
    const badMagic = valid.slice();
    badMagic[0] = 0x00;
    expect(decodeTelemetryFrame(badMagic)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'MAGIC_MISMATCH' }],
    });

    const badVersion = valid.slice();
    badVersion[2] = 0x09;
    expect(decodeTelemetryFrame(badVersion)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'UNSUPPORTED_VERSION' }],
    });

    const truncated = valid.slice(0, valid.length - 1);
    expect(truncated.length).toBeGreaterThanOrEqual(HEADER_SIZE + CRC_SIZE);
    expect(decodeTelemetryFrame(truncated)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'FRAME_LENGTH_MISMATCH' }],
    });
  });

  it('Exercises TRUNCATE_RECORD, BINARY_BIT_FLIP, and FSM_BYPASS fault injection paths', () => {
    const sample = SAMPLE_SCENARIOS[0]!;

    const truncated = runStitchPipeline({
      copybookSource: sample.copybook,
      batchLines: sample.batchLines,
      faultMode: 'TRUNCATE_RECORD',
    });
    expect(truncated.ok).toBe(false);
    expect(truncated.triage.some((t) => t.signature === 'RECORD_WIDTH_MISMATCH')).toBe(true);

    const bitFlip = runStitchPipeline({
      copybookSource: sample.copybook,
      batchLines: sample.batchLines,
      faultMode: 'BINARY_BIT_FLIP',
    });
    expect(bitFlip.ok).toBe(false);
    expect(bitFlip.triage.some((t) => t.signature === 'CRC_MISMATCH')).toBe(true);

    const fsmBypass = runStitchPipeline({
      copybookSource: sample.copybook,
      batchLines: sample.batchLines,
      faultMode: 'FSM_BYPASS',
    });
    expect(fsmBypass.ok).toBe(false);
    expect(fsmBypass.triage.some((t) => t.signature === 'FSM_VIOLATION')).toBe(true);
  });

  it('Executes stitchops-cli cleanly against examples/treasury.cpy and examples/treasury.dat', () => {
    const cliPath = resolve(process.cwd(), 'scripts/stitchops-cli.ts');
    const stdout = execFileSync(
      process.execPath,
      [cliPath, '--copybook', 'examples/treasury.cpy', '--batch', 'examples/treasury.dat', '--json'],
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(stdout) as { ok: boolean; stats: { settledCount: number } };
    expect(parsed.ok).toBe(true);
    expect(parsed.stats.settledCount).toBe(3);
  });
});
