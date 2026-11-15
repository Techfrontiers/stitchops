/**
 * Organ 1: COBOL Copybook Schema Parser & Fixed-Width Batch Codec.
 * Pure TypeScript with zero DOM/Node side effects.
 */

export type FieldKind = 'string' | 'int' | 'decimal';

export interface CopybookField {
  name: string;
  level: number;
  picRaw: string;
  kind: FieldKind;
  /** Number of integer/alphanumeric character positions (excluding sign). */
  digits: number;
  /** Implied decimal places after V (0 for string/int). */
  scale: number;
  /** True when PIC starts with S (explicit '+' or '-' sign character). */
  signed: boolean;
  /** Total character/byte width in the fixed-width record. */
  width: number;
  /** Zero-based starting offset in the fixed-width record. */
  offset: number;
}

export interface CopybookSchema {
  recordName: string;
  fields: CopybookField[];
  totalWidth: number;
}

export interface CopybookDiagnostic {
  code: 'INVALID_SYNTAX' | 'UNSUPPORTED_PIC' | 'EMPTY_COPYBOOK';
  line: number;
  token?: string;
  message: string;
}

export interface RecordDiagnostic {
  code:
    | 'RECORD_WIDTH_MISMATCH'
    | 'S0C7_DATA_EXCEPTION'
    | 'MISSING_FIELD'
    | 'FIELD_OVERFLOW'
    | 'INVALID_SIGN';
  field?: string;
  offset?: number;
  expected?: string | number;
  actual?: string | number;
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; diagnostics: E };

const PIC_COUNT_PATTERN = /^(S)?(X|9)(?:\((\d+)\)|(X+|9+))?(?:V(9)(?:\((\d+)\)|(9*))?)?$/i;

function parsePicClause(picRaw: string): {
  kind: FieldKind;
  digits: number;
  scale: number;
  signed: boolean;
  width: number;
} | null {
  const normalized = picRaw.trim().toUpperCase();
  const match = PIC_COUNT_PATTERN.exec(normalized);
  if (!match) return null;

  const signed = Boolean(match[1]);
  const baseChar = match[2];
  const explicitCount = match[3] ? Number.parseInt(match[3], 10) : undefined;
  const repeatedChars = match[4];

  if (!baseChar) return null;

  const primaryCount =
    explicitCount !== undefined
      ? explicitCount
      : repeatedChars !== undefined
        ? repeatedChars.length + 1
        : 1;

  if (!Number.isFinite(primaryCount) || primaryCount <= 0) {
    return null;
  }

  if (baseChar === 'X') {
    // Alphanumeric fields cannot be signed or have implied decimals.
    if (signed || match[5]) return null;
    return {
      kind: 'string',
      digits: primaryCount,
      scale: 0,
      signed: false,
      width: primaryCount,
    };
  }

  // Numeric field (9)
  let scale = 0;
  if (match[5]) {
    const scaleExplicit = match[6] ? Number.parseInt(match[6], 10) : undefined;
    const scaleRepeat = match[7];
    scale =
      scaleExplicit !== undefined
        ? scaleExplicit
        : scaleRepeat !== undefined
          ? scaleRepeat.length + 1
          : 1;
  }

  if (!Number.isFinite(scale) || scale < 0) {
    return null;
  }

  const width = (signed ? 1 : 0) + primaryCount + scale;
  return {
    kind: scale > 0 ? 'decimal' : 'int',
    digits: primaryCount,
    scale,
    signed,
    width,
  };
}

/**
 * Parses a COBOL Copybook definition into a typed fixed-width layout.
 */
export function parseCopybook(source: string): Result<CopybookSchema, CopybookDiagnostic[]> {
  const lines = source.split(/\r?\n/);
  const diagnostics: CopybookDiagnostic[] = [];
  const fields: CopybookField[] = [];
  let recordName = 'ROOT-RECORD';
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    if (!trimmed) continue;
    // Skip COBOL comment lines (* in col 7 or leading * / *>)
    if (trimmed.startsWith('*') || (rawLine.length >= 7 && rawLine[6] === '*')) {
      continue;
    }

    // Strip trailing period
    const statement = trimmed.replace(/\.$/, '').trim();
    if (!statement) continue;

    // Group / 01 header without PIC
    const headerMatch = /^(\d{2})\s+([A-Z0-9_-]+)$/i.exec(statement);
    if (headerMatch) {
      const level = Number.parseInt(headerMatch[1] ?? '0', 10);
      const name = (headerMatch[2] ?? '').toUpperCase();
      if (level === 1) {
        recordName = name;
      }
      continue;
    }

    // Leaf field with PIC / PICTURE [IS]
    const fieldMatch = /^(\d{2})\s+([A-Z0-9_-]+)\s+(?:PIC|PICTURE)(?:\s+IS)?\s+([^\s.]+)(?:\s+.*)?$/i.exec(
      statement,
    );
    if (!fieldMatch) {
      diagnostics.push({
        code: 'INVALID_SYNTAX',
        line: lineNumber,
        token: trimmed,
        message: `Line ${lineNumber}: Expected COBOL level + field name + PIC clause.`,
      });
      continue;
    }

    const level = Number.parseInt(fieldMatch[1] ?? '5', 10);
    const name = (fieldMatch[2] ?? '').toUpperCase();
    const picRaw = (fieldMatch[3] ?? '').toUpperCase();
    const parsedPic = parsePicClause(picRaw);

    if (!parsedPic) {
      diagnostics.push({
        code: 'UNSUPPORTED_PIC',
        line: lineNumber,
        token: picRaw,
        message: `Line ${lineNumber}: Unsupported or malformed PIC clause "${picRaw}" for field ${name}.`,
      });
      continue;
    }

    fields.push({
      name,
      level,
      picRaw,
      kind: parsedPic.kind,
      digits: parsedPic.digits,
      scale: parsedPic.scale,
      signed: parsedPic.signed,
      width: parsedPic.width,
      offset: currentOffset,
    });
    currentOffset += parsedPic.width;
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  if (fields.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'EMPTY_COPYBOOK',
          line: 1,
          message: 'Copybook contains no elementary PIC fields.',
        },
      ],
    };
  }

  return {
    ok: true,
    value: {
      recordName,
      fields,
      totalWidth: currentOffset,
    },
  };
}

export type DecodedRecord = Record<string, string | number>;

/**
 * Decodes one fixed-width record line according to the CopybookSchema.
 */
export function decodeRecord(
  schema: CopybookSchema,
  line: string,
): Result<DecodedRecord, RecordDiagnostic[]> {
  if (line.length !== schema.totalWidth) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'RECORD_WIDTH_MISMATCH',
          expected: schema.totalWidth,
          actual: line.length,
          message: `Record byte width ${line.length} does not match copybook width ${schema.totalWidth}.`,
        },
      ],
    };
  }

  const diagnostics: RecordDiagnostic[] = [];
  const result: DecodedRecord = {};

  for (const field of schema.fields) {
    const slice = line.slice(field.offset, field.offset + field.width);

    if (field.kind === 'string') {
      result[field.name] = slice.replace(/\s+$/, '');
      continue;
    }

    let signMultiplier = 1;
    let digitsSlice = slice;

    if (field.signed) {
      const signChar = slice[0];
      if (signChar === '+') {
        signMultiplier = 1;
      } else if (signChar === '-') {
        signMultiplier = -1;
      } else {
        diagnostics.push({
          code: 'INVALID_SIGN',
          field: field.name,
          offset: field.offset,
          expected: "'+' or '-'",
          actual: signChar ?? '',
          message: `Field ${field.name} at offset ${field.offset} has invalid sign prefix "${signChar ?? ''}".`,
        });
        continue;
      }
      digitsSlice = slice.slice(1);
    }

    if (!/^\d+$/.test(digitsSlice)) {
      diagnostics.push({
        code: 'S0C7_DATA_EXCEPTION',
        field: field.name,
        offset: field.offset,
        expected: `${field.digits + field.scale} ASCII digits`,
        actual: digitsSlice,
        message: `S0C7 Data Exception in ${field.name} at offset ${field.offset}: non-numeric bytes "${digitsSlice}".`,
      });
      continue;
    }

    const rawInteger = Number.parseInt(digitsSlice, 10);
    const scaled =
      field.scale > 0 ? Number((rawInteger / 10 ** field.scale).toFixed(field.scale)) : rawInteger;
    const finalNumber = signMultiplier * scaled;
    // Normalize -0 to 0 for clean JS equality
    result[field.name] = Object.is(finalNumber, -0) ? 0 : finalNumber;
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return { ok: true, value: result };
}

/**
 * Encodes a structured record into an exact fixed-width mainframe line.
 */
export function encodeRecord(
  schema: CopybookSchema,
  record: DecodedRecord,
): Result<string, RecordDiagnostic[]> {
  const diagnostics: RecordDiagnostic[] = [];
  const chunks: string[] = [];

  for (const field of schema.fields) {
    const rawValue = record[field.name];
    if (rawValue === undefined || rawValue === null) {
      diagnostics.push({
        code: 'MISSING_FIELD',
        field: field.name,
        offset: field.offset,
        message: `Missing required copybook field "${field.name}".`,
      });
      continue;
    }

    if (field.kind === 'string') {
      const text = String(rawValue);
      if (text.length > field.width) {
        diagnostics.push({
          code: 'FIELD_OVERFLOW',
          field: field.name,
          offset: field.offset,
          expected: `<= ${field.width} chars`,
          actual: text.length,
          message: `Field ${field.name} length ${text.length} exceeds PIC X(${field.width}).`,
        });
        continue;
      }
      chunks.push(text.padEnd(field.width, ' '));
      continue;
    }

    const numValue = Number(rawValue);
    if (!Number.isFinite(numValue)) {
      diagnostics.push({
        code: 'S0C7_DATA_EXCEPTION',
        field: field.name,
        offset: field.offset,
        expected: 'finite number',
        actual: String(rawValue),
        message: `Field ${field.name} received non-finite numeric value "${String(rawValue)}".`,
      });
      continue;
    }

    if (!field.signed && numValue < 0) {
      diagnostics.push({
        code: 'INVALID_SIGN',
        field: field.name,
        offset: field.offset,
        expected: 'non-negative number',
        actual: numValue,
        message: `Unsigned field ${field.name} cannot encode negative value ${numValue}.`,
      });
      continue;
    }

    const absScaled = Math.round(Math.abs(numValue) * 10 ** field.scale);
    const maxDigits = field.digits + field.scale;
    const digitText = String(absScaled);

    if (digitText.length > maxDigits) {
      diagnostics.push({
        code: 'FIELD_OVERFLOW',
        field: field.name,
        offset: field.offset,
        expected: `<= ${maxDigits} digits`,
        actual: digitText.length,
        message: `Numeric value ${numValue} overflows ${field.picRaw} (${maxDigits} digits).`,
      });
      continue;
    }

    const paddedDigits = digitText.padStart(maxDigits, '0');
    const signPrefix = field.signed ? (numValue < 0 ? '-' : '+') : '';
    chunks.push(`${signPrefix}${paddedDigits}`);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return { ok: true, value: chunks.join('') };
}
