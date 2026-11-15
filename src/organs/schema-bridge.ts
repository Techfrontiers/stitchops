import type { CopybookSchema } from './cobol-parser.ts';

/**
 * Organ 3: JSON Schema 2020-12 / OpenAPI 3.1 Synthesizer & Legacy ABEND Triage Engine.
 */

export interface JsonSchemaProperty {
  type: 'string' | 'integer' | 'number';
  description: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  'x-cobol-pic': string;
  'x-cobol-offset': number;
  'x-cobol-width': number;
}

export interface GeneratedContract {
  $schema: 'https://json-schema.org/draft/2020-12/schema';
  title: string;
  type: 'object';
  additionalProperties: false;
  required: string[];
  properties: Record<string, JsonSchemaProperty>;
  openApiSnippet: {
    openapi: '3.1.0';
    info: { title: string; version: string };
    paths: Record<string, unknown>;
    components: {
      schemas: Record<string, unknown>;
    };
  };
}

export interface TriageAdvice {
  signature: string;
  severity: 'critical' | 'warning';
  organ: 'cobol-parser' | 'packet-verifier' | 'schema-bridge';
  title: string;
  rootCause: string;
  remediation: string;
  patchHint: string;
}

const KNOWN_SIGNATURES: Record<string, Omit<TriageAdvice, 'signature'>> = {
  S0C7: {
    severity: 'critical',
    organ: 'cobol-parser',
    title: 'IBM S0C7 Data Exception (Invalid Numeric Bytes)',
    rootCause:
      'A PIC 9 / S9 numeric field received non-digit EBCDIC/ASCII characters (spaces, hex garbage, or uninitialized memory).',
    remediation:
      'Zero-fill numeric slots ("0") or run deterministic byte sanitization before binary telemetry framing.',
    patchHint: 'Sanitize non-digits to "0" across numeric PIC offsets.',
  },
  S0C4: {
    severity: 'critical',
    organ: 'cobol-parser',
    title: 'IBM S0C4 Protection / Boundary Exception',
    rootCause:
      'Record byte length exceeded or fell short of the fixed Copybook descriptor width.',
    remediation: 'Pad truncated lines or reject oversized payloads at the Copybook boundary.',
    patchHint: 'Normalize fixed-width line length to schema.totalWidth.',
  },
  S322: {
    severity: 'warning',
    organ: 'schema-bridge',
    title: 'IBM S322 Batch Step CPU Timeout',
    rootCause: 'Long-running batch loop stalled prior to checkpoint commit.',
    remediation: 'Split monolithic batch file into chunked telemetry frames (<= 1,000 records/frame).',
    patchHint: 'Chunk stream and resume from last SETTLED sequence ID.',
  },
  RECORD_WIDTH_MISMATCH: {
    severity: 'critical',
    organ: 'cobol-parser',
    title: 'Copybook Width Mismatch',
    rootCause: 'Input fixed-width line does not equal total sum of Copybook PIC field widths.',
    remediation: 'Right-pad short lines with spaces or slice/split concatenated mainframe records.',
    patchHint: 'Pad or split record to exact copybook byte length.',
  },
  CRC_MISMATCH: {
    severity: 'critical',
    organ: 'packet-verifier',
    title: 'CRC-16/XMODEM Frame Corruption Detected',
    rootCause: 'One or more bits in the telemetry header or JSON payload changed after encoding.',
    remediation: 'Quarantine corrupted frame, preserve ABENDED state, and replay from Copybook source.',
    patchHint: 'Trigger ABENDED -> REPAIRED -> STAGED re-transmission.',
  },
  FSM_VIOLATION: {
    severity: 'critical',
    organ: 'packet-verifier',
    title: 'Illegal Operational Lifecycle Transition',
    rootCause: 'A record attempted to jump directly from ABENDED to SETTLED without entering REPAIRED.',
    remediation: 'Enforce REPAIRED quarantine verification gate before re-staging.',
    patchHint: 'Insert REPAIRED -> STAGED transition prior to SETTLED.',
  },
};

export function synthesizeSchema(schema: CopybookSchema): GeneratedContract {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const field of schema.fields) {
    required.push(field.name);

    if (field.kind === 'string') {
      properties[field.name] = {
        type: 'string',
        maxLength: field.width,
        description: `COBOL ${field.picRaw} @ byte offset ${field.offset}..${field.offset + field.width - 1}`,
        'x-cobol-pic': field.picRaw,
        'x-cobol-offset': field.offset,
        'x-cobol-width': field.width,
      };
      continue;
    }

    const maxIntPart = 10 ** field.digits - 1;
    const maxDecimalPart = field.scale > 0 ? (10 ** field.scale - 1) / 10 ** field.scale : 0;
    const maxBound = Number((maxIntPart + maxDecimalPart).toFixed(field.scale));
    const minBound = field.signed ? -maxBound : 0;

    properties[field.name] = {
      type: field.kind === 'int' ? 'integer' : 'number',
      minimum: minBound,
      maximum: maxBound,
      ...(field.scale > 0 ? { multipleOf: Number((10 ** -field.scale).toFixed(field.scale)) } : {}),
      description: `COBOL ${field.picRaw} @ byte offset ${field.offset}..${field.offset + field.width - 1}`,
      'x-cobol-pic': field.picRaw,
      'x-cobol-offset': field.offset,
      'x-cobol-width': field.width,
    };
  }

  const coreSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema' as const,
    title: schema.recordName,
    type: 'object' as const,
    additionalProperties: false as const,
    required,
    properties,
  };

  const slug = schema.recordName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    ...coreSchema,
    openApiSnippet: {
      openapi: '3.1.0',
      info: {
        title: `StitchOps Bridge — ${schema.recordName}`,
        version: '1.0.0',
      },
      paths: {
        [`/v1/batches/${slug}/ingest`]: {
          post: {
            summary: `Ingest stitched ${schema.recordName} telemetry frame`,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${schema.recordName}` },
                },
              },
            },
            responses: {
              '200': { description: 'CRC-16 verified & FSM state SETTLED' },
              '422': { description: 'S0C7 / Copybook / CRC validation failure' },
            },
          },
        },
      },
      components: {
        schemas: {
          [schema.recordName]: coreSchema,
        },
      },
    },
  };
}

/**
 * Matches diagnostic codes or raw mainframe ABEND log text to deterministic triage advice.
 */
export function diagnoseAnomalies(codesOrLogText: readonly string[]): TriageAdvice[] {
  const seen = new Set<string>();
  const results: TriageAdvice[] = [];

  for (const raw of codesOrLogText) {
    const upper = raw.toUpperCase();
    for (const [sig, template] of Object.entries(KNOWN_SIGNATURES)) {
      if (upper.includes(sig) && !seen.has(sig)) {
        seen.add(sig);
        results.push({ signature: sig, ...template });
      }
    }
  }

  return results;
}
