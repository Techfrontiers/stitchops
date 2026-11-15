import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runStitchPipeline,
  type FaultInjectionMode,
} from '../src/organs/stitch-pipeline.ts';
import { encodeTelemetryFrame } from '../src/organs/packet-verifier.ts';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--repair') {
      args.repair = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token.startsWith('--') && i + 1 < argv.length) {
      const key = token.slice(2);
      const val = argv[i + 1];
      if (val !== undefined) {
        args[key] = val;
        i += 1;
      }
    }
  }
  return args;
}

const parsed = parseArgs(process.argv.slice(2));
const copybookPath = resolve(
  process.cwd(),
  typeof parsed.copybook === 'string' ? parsed.copybook : 'examples/treasury.cpy',
);
const batchPath = resolve(
  process.cwd(),
  typeof parsed.batch === 'string' ? parsed.batch : 'examples/treasury.dat',
);
const faultMode =
  (typeof parsed.fault === 'string' ? parsed.fault : 'NONE') as FaultInjectionMode;
const autoRepair = Boolean(parsed.repair);

const copybookSource = readFileSync(copybookPath, 'utf8');
const batchLines = readFileSync(batchPath, 'utf8');

const report = runStitchPipeline({
  copybookSource,
  batchLines,
  faultMode,
  autoRepair,
});

if (typeof parsed['out-openapi'] === 'string' && report.contract) {
  const outOpenApi = resolve(process.cwd(), parsed['out-openapi']);
  writeFileSync(outOpenApi, JSON.stringify(report.contract.openApiSnippet, null, 2), 'utf8');
}

if (typeof parsed['out-frame'] === 'string' && report.traces[0]?.decoded) {
  const outFrame = resolve(process.cwd(), parsed['out-frame']);
  const firstFrame = encodeTelemetryFrame(1, {
    recordName: report.schema?.recordName ?? 'STITCH-REC',
    seq: 1,
    fields: report.traces[0].decoded,
  });
  writeFileSync(outFrame, firstFrame);
}

if (parsed.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`StitchOps CLI Report — ok=${report.ok}`);
  console.log(
    `Records: ${report.stats.settledCount}/${report.stats.totalRecords} SETTLED (${report.stats.abendedCount} ABENDED) in ${report.stats.executionMs}ms`,
  );
  for (const organ of report.organs) {
    console.log(`  [${organ.status.toUpperCase()}] ${organ.label}: ${organ.detail}`);
  }
  if (report.triage.length > 0) {
    console.log('Automated Triage:');
    for (const item of report.triage) {
      console.log(`  - [${item.signature}] ${item.title} -> ${item.patchHint}`);
    }
  }
}

if (!report.ok) {
  process.exitCode = 1;
}
