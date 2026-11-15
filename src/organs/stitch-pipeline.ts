import {
  decodeRecord,
  encodeRecord,
  parseCopybook,
  type CopybookDiagnostic,
  type CopybookSchema,
  type DecodedRecord,
  type RecordDiagnostic,
} from './cobol-parser.ts';
import {
  decodeTelemetryFrame,
  encodeTelemetryFrame,
  flipBit,
  formatHexDump,
  verifyStateSequence,
  type FrameDiagnostic,
  type OperationalState,
} from './packet-verifier.ts';
import {
  diagnoseAnomalies,
  synthesizeSchema,
  type GeneratedContract,
  type TriageAdvice,
} from './schema-bridge.ts';

/**
 * Organ 4: Unified Frankenstein Pipeline Orchestrator.
 */

export type FaultInjectionMode = 'NONE' | 'S0C7_CORRUPTION' | 'TRUNCATE_RECORD' | 'BINARY_BIT_FLIP' | 'FSM_BYPASS';

export interface OrganHeartbeat {
  id: 'cobol-parser' | 'packet-verifier' | 'schema-bridge' | 'stitch-pipeline';
  label: string;
  techStack: string;
  status: 'healthy' | 'degraded' | 'abended';
  detail: string;
}

export interface StitchedRecordTrace {
  lineNumber: number;
  rawLine: string;
  decoded?: DecodedRecord;
  roundTripLine?: string;
  roundTripMatch: boolean;
  frameBytesLength: number;
  crcHex?: string;
  frameHexPreview: string;
  stateHistory: OperationalState[];
  status: 'SETTLED' | 'ABENDED';
  diagnostics: Array<RecordDiagnostic | FrameDiagnostic | { code: string; message: string }>;
}

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
}

export function applyFaultToLine(line: string, mode: FaultInjectionMode): string {
  if (mode === 'TRUNCATE_RECORD') {
    return line.slice(0, Math.max(1, line.length - 5));
  }
  if (mode === 'S0C7_CORRUPTION' && line.length > 6) {
    // Inject non-numeric ASCII hex chars into numeric portion near end of fixed-width line
    const pos = Math.max(0, line.length - 6);
    return `${line.slice(0, pos)}?X${line.slice(pos + 2)}`;
  }
  return line;
}

/**
 * Repairs a broken fixed-width record line according to Copybook schema rules.
 */
export function repairFixedWidthLine(schema: CopybookSchema, line: string): string {
  const padded = line.padEnd(schema.totalWidth, ' ').slice(0, schema.totalWidth);
  const chars = padded.split('');

  for (const field of schema.fields) {
    if (field.kind === 'string') continue;

    let start = field.offset;
    if (field.signed) {
      const s = chars[start];
      if (s !== '+' && s !== '-') {
        chars[start] = '+';
      }
      start += 1;
    }

    for (let idx = start; idx < field.offset + field.width; idx++) {
      const ch = chars[idx] ?? '';
      if (!/^\d$/.test(ch)) {
        chars[idx] = '0';
      }
    }
  }

  return chars.join('');
}

export function runStitchPipeline(options: {
  copybookSource: string;
  batchLines: string;
  faultMode?: FaultInjectionMode;
  autoRepair?: boolean;
}): PipelineExecutionReport {
  const startedAt = performance.now();
  const faultMode = options.faultMode ?? 'NONE';
  const autoRepair = options.autoRepair ?? false;

  const parsedSchema = parseCopybook(options.copybookSource);
  if (!parsedSchema.ok) {
    return {
      ok: false,
      copybookDiagnostics: parsedSchema.diagnostics,
      traces: [],
      triage: diagnoseAnomalies(parsedSchema.diagnostics.map((d) => `${d.code} ${d.message}`)),
      organs: [
        {
          id: 'cobol-parser',
          label: 'COBOL Copybook Parser',
          techStack: 'Mainframe Fixed-Width AST',
          status: 'abended',
          detail: `${parsedSchema.diagnostics.length} syntax diagnostic(s)`,
        },
        {
          id: 'packet-verifier',
          label: 'Binary Telemetry Verifier',
          techStack: 'CRC-16/XMODEM + FSM',
          status: 'degraded',
          detail: 'Waiting for valid Copybook layout',
        },
        {
          id: 'schema-bridge',
          label: 'Schema & Triage Alchemist',
          techStack: 'JSON Schema 2020-12 + OpenAPI',
          status: 'degraded',
          detail: 'Waiting for Copybook fields',
        },
        {
          id: 'stitch-pipeline',
          label: 'Chimera Orchestrator',
          techStack: 'End-to-End Stitch Ledger',
          status: 'abended',
          detail: 'Halted at Organ 1',
        },
      ],
      stats: {
        totalRecords: 0,
        settledCount: 0,
        abendedCount: 0,
        executionMs: Number((performance.now() - startedAt).toFixed(2)),
      },
    };
  }

  const schema = parsedSchema.value;
  const contract = synthesizeSchema(schema);
  const rawLines = options.batchLines
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  const traces: StitchedRecordTrace[] = [];
  const anomalyTokens: string[] = [];
  let settledCount = 0;
  let abendedCount = 0;

  rawLines.forEach((origLine, index) => {
    const seq = index + 1;
    let workingLine = index === 0 ? applyFaultToLine(origLine, faultMode) : origLine;
    const stateHistory: OperationalState[] = ['INIT'];
    const diagnostics: StitchedRecordTrace['diagnostics'] = [];

    let decodedResult = decodeRecord(schema, workingLine);

    if (!decodedResult.ok && autoRepair) {
      stateHistory.push('ABENDED', 'REPAIRED');
      workingLine = repairFixedWidthLine(schema, workingLine);
      decodedResult = decodeRecord(schema, workingLine);
    }

    if (!decodedResult.ok) {
      abendedCount += 1;
      stateHistory.push('ABENDED');
      diagnostics.push(...decodedResult.diagnostics);
      for (const d of decodedResult.diagnostics) {
        anomalyTokens.push(`${d.code} ${d.message}`);
      }
      traces.push({
        lineNumber: seq,
        rawLine: workingLine,
        roundTripMatch: false,
        frameBytesLength: 0,
        frameHexPreview: '(No binary frame emitted — halted at Organ 1)',
        stateHistory,
        status: 'ABENDED',
        diagnostics,
      });
      return;
    }

    stateHistory.push('STAGED');
    const reEncoded = encodeRecord(schema, decodedResult.value);
    const roundTripLine = reEncoded.ok ? reEncoded.value : undefined;
    const roundTripMatch = roundTripLine === workingLine;

    let frame = encodeTelemetryFrame(seq, {
      recordName: schema.recordName,
      seq,
      fields: decodedResult.value,
    });

    if (faultMode === 'BINARY_BIT_FLIP' && index === 0 && !autoRepair) {
      // Flip a bit inside payload/header region so CRC-16 catches it cleanly
      frame = flipBit(frame, frame.length * 8 - 17);
    }

    const decodedFrame = decodeTelemetryFrame(frame);
    if (!decodedFrame.ok) {
      abendedCount += 1;
      stateHistory.push('ABENDED');
      diagnostics.push(...decodedFrame.diagnostics);
      for (const d of decodedFrame.diagnostics) {
        anomalyTokens.push(`${d.code} ${d.message}`);
      }
      traces.push({
        lineNumber: seq,
        rawLine: workingLine,
        decoded: decodedResult.value,
        roundTripLine,
        roundTripMatch,
        frameBytesLength: frame.length,
        frameHexPreview: formatHexDump(frame),
        stateHistory,
        status: 'ABENDED',
        diagnostics,
      });
      return;
    }

    if (faultMode === 'FSM_BYPASS' && index === 0 && !autoRepair) {
      stateHistory.push('ABENDED', 'SETTLED');
    } else {
      stateHistory.push('SETTLED');
    }

    const fsmCheck = verifyStateSequence(stateHistory);
    if (!fsmCheck.ok) {
      abendedCount += 1;
      diagnostics.push(...fsmCheck.diagnostics);
      for (const d of fsmCheck.diagnostics) {
        anomalyTokens.push(`${d.code} ${d.message}`);
      }
      traces.push({
        lineNumber: seq,
        rawLine: workingLine,
        decoded: decodedResult.value,
        roundTripLine,
        roundTripMatch,
        frameBytesLength: frame.length,
        crcHex: decodedFrame.value.crcHex,
        frameHexPreview: decodedFrame.value.rawHex,
        stateHistory,
        status: 'ABENDED',
        diagnostics,
      });
      return;
    }

    settledCount += 1;
    traces.push({
      lineNumber: seq,
      rawLine: workingLine,
      decoded: decodedResult.value,
      roundTripLine,
      roundTripMatch,
      frameBytesLength: frame.length,
      crcHex: decodedFrame.value.crcHex,
      frameHexPreview: decodedFrame.value.rawHex,
      stateHistory,
      status: 'SETTLED',
      diagnostics,
    });
  });

  const hasOrgan1Fault = traces.some((t) =>
    t.diagnostics.some((d) =>
      ['RECORD_WIDTH_MISMATCH', 'S0C7_DATA_EXCEPTION', 'INVALID_SIGN'].includes(d.code),
    ),
  );
  const hasOrgan2Fault = traces.some((t) =>
    t.diagnostics.some((d) =>
      ['CRC_MISMATCH', 'MAGIC_MISMATCH', 'FSM_VIOLATION', 'FRAME_LENGTH_MISMATCH'].includes(d.code),
    ),
  );

  const organs: OrganHeartbeat[] = [
    {
      id: 'cobol-parser',
      label: 'Organ 1 · COBOL Copybook',
      techStack: `${schema.fields.length} fields (${schema.totalWidth}B width)`,
      status: hasOrgan1Fault ? 'abended' : 'healthy',
      detail: hasOrgan1Fault ? 'Data/width fault detected' : `100% deterministic (${rawLines.length} lines)`,
    },
    {
      id: 'packet-verifier',
      label: 'Organ 2 · Binary Telemetry',
      techStack: 'CRC-16/XMODEM + FSM Guard',
      status: hasOrgan2Fault ? 'abended' : hasOrgan1Fault ? 'degraded' : 'healthy',
      detail: hasOrgan2Fault
        ? 'Frame integrity or FSM violation'
        : `${settledCount}/${rawLines.length} frames verified`,
    },
    {
      id: 'schema-bridge',
      label: 'Organ 3 · Schema & Triage',
      techStack: 'OpenAPI 3.1 + ABEND Engine',
      status: 'healthy',
      detail: `Contract synthesized (${contract.required.length} props)`,
    },
    {
      id: 'stitch-pipeline',
      label: 'Organ 4 · Anatomy Ledger',
      techStack: 'Unified Replay & Diff Engine',
      status: abendedCount > 0 ? 'degraded' : 'healthy',
      detail:
        abendedCount > 0
          ? `${settledCount} settled · ${abendedCount} abended`
          : `All ${settledCount} records SETTLED`,
    },
  ];

  return {
    ok: abendedCount === 0,
    schema,
    copybookDiagnostics: [],
    contract,
    traces,
    triage: diagnoseAnomalies(anomalyTokens),
    organs,
    stats: {
      totalRecords: rawLines.length,
      settledCount,
      abendedCount,
      executionMs: Number((performance.now() - startedAt).toFixed(2)),
    },
  };
}
