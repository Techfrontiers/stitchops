/**
 * Organ 2: Binary Telemetry Frame Codec (CRC-16/XMODEM) & Operational FSM Verifier.
 * Frame Layout (Big-Endian):
 *   [0..1]   Magic = 0x53, 0x54 ("ST")
 *   [2]      Version = 0x01
 *   [3..6]   Sequence ID (uint32 BE)
 *   [7..8]   Payload Length (uint16 BE)
 *   [9..9+N-1] UTF-8 JSON Payload
 *   [9+N..9+N+1] CRC-16/XMODEM (uint16 BE over bytes 0..9+N-1)
 */

export const FRAME_MAGIC_0 = 0x53; // 'S'
export const FRAME_MAGIC_1 = 0x54; // 'T'
export const FRAME_VERSION = 0x01;
export const HEADER_SIZE = 9;
export const CRC_SIZE = 2;

export interface FrameDiagnostic {
  code:
    | 'FRAME_TOO_SHORT'
    | 'MAGIC_MISMATCH'
    | 'UNSUPPORTED_VERSION'
    | 'FRAME_LENGTH_MISMATCH'
    | 'CRC_MISMATCH'
    | 'INVALID_UTF8_JSON';
  expected?: string | number;
  actual?: string | number;
  message: string;
}

export interface DecodedTelemetryFrame<T = unknown> {
  version: number;
  sequenceId: number;
  payloadLength: number;
  crcHex: string;
  payload: T;
  rawHex: string;
}

export type FrameResult<T> = { ok: true; value: T } | { ok: false; diagnostics: FrameDiagnostic[] };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Computes deterministic CRC-16/XMODEM (polynomial 0x1021, initial value 0x0000).
 */
export function computeCrc16Xmodem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
}

export function formatHex16(value: number): string {
  return `0x${(value & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

export function formatHexDump(bytes: Uint8Array, bytesPerLine = 16): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const chunk = bytes.slice(offset, offset + bytesPerLine);
    const addr = offset.toString(16).toUpperCase().padStart(4, '0');
    const hex = Array.from(chunk, (b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ')
      .padEnd(bytesPerLine * 3 - 1, ' ');
    const ascii = Array.from(chunk, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(
      '',
    );
    lines.push(`${addr}  ${hex}  |${ascii}|`);
  }
  return lines.join('\n');
}

export function encodeTelemetryFrame(sequenceId: number, payload: unknown): Uint8Array {
  const jsonText = JSON.stringify(payload);
  const payloadBytes = textEncoder.encode(jsonText);
  if (payloadBytes.length > 0xffff) {
    throw new RangeError(`Payload byte length ${payloadBytes.length} exceeds uint16 max (65535).`);
  }

  const totalLength = HEADER_SIZE + payloadBytes.length + CRC_SIZE;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);

  frame[0] = FRAME_MAGIC_0;
  frame[1] = FRAME_MAGIC_1;
  frame[2] = FRAME_VERSION;
  view.setUint32(3, sequenceId >>> 0, false);
  view.setUint16(7, payloadBytes.length, false);
  frame.set(payloadBytes, HEADER_SIZE);

  const crc = computeCrc16Xmodem(frame.subarray(0, HEADER_SIZE + payloadBytes.length));
  view.setUint16(HEADER_SIZE + payloadBytes.length, crc, false);

  return frame;
}

export function decodeTelemetryFrame<T = unknown>(
  frame: Uint8Array,
): FrameResult<DecodedTelemetryFrame<T>> {
  if (frame.length < HEADER_SIZE + CRC_SIZE) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'FRAME_TOO_SHORT',
          expected: HEADER_SIZE + CRC_SIZE,
          actual: frame.length,
          message: `Frame length ${frame.length} is shorter than minimum ${HEADER_SIZE + CRC_SIZE} bytes.`,
        },
      ],
    };
  }

  const m0 = frame[0] ?? 0;
  const m1 = frame[1] ?? 0;
  if (m0 !== FRAME_MAGIC_0 || m1 !== FRAME_MAGIC_1) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'MAGIC_MISMATCH',
          expected: '0x53 0x54',
          actual: `0x${m0.toString(16).toUpperCase().padStart(2, '0')} 0x${m1.toString(16).toUpperCase().padStart(2, '0')}`,
          message: `Invalid StitchOps frame magic bytes.`,
        },
      ],
    };
  }

  const version = frame[2] ?? 0;
  if (version !== FRAME_VERSION) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'UNSUPPORTED_VERSION',
          expected: FRAME_VERSION,
          actual: version,
          message: `Unsupported telemetry frame version ${version}.`,
        },
      ],
    };
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const sequenceId = view.getUint32(3, false);
  const payloadLength = view.getUint16(7, false);
  const expectedTotal = HEADER_SIZE + payloadLength + CRC_SIZE;

  if (frame.length !== expectedTotal) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'FRAME_LENGTH_MISMATCH',
          expected: expectedTotal,
          actual: frame.length,
          message: `Header declared ${payloadLength} payload bytes (total ${expectedTotal}), received ${frame.length} bytes.`,
        },
      ],
    };
  }

  const crcOffset = HEADER_SIZE + payloadLength;
  const actualCrc = view.getUint16(crcOffset, false);
  const computedCrc = computeCrc16Xmodem(frame.subarray(0, crcOffset));

  if (actualCrc !== computedCrc) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'CRC_MISMATCH',
          expected: formatHex16(computedCrc),
          actual: formatHex16(actualCrc),
          message: `CRC-16/XMODEM mismatch: expected ${formatHex16(computedCrc)}, got ${formatHex16(actualCrc)}.`,
        },
      ],
    };
  }

  try {
    const payloadBytes = frame.subarray(HEADER_SIZE, crcOffset);
    const decodedJson = textDecoder.decode(payloadBytes);
    const payload = JSON.parse(decodedJson) as T;
    return {
      ok: true,
      value: {
        version,
        sequenceId,
        payloadLength,
        crcHex: formatHex16(actualCrc),
        payload,
        rawHex: formatHexDump(frame),
      },
    };
  } catch (err) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INVALID_UTF8_JSON',
          message: `Payload decode failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

/**
 * Flips a single bit inside a cloned Uint8Array frame (for fault injection & PBT).
 */
export function flipBit(bytes: Uint8Array, bitIndex: number): Uint8Array {
  if (bytes.length === 0) return new Uint8Array(0);
  const copy = bytes.slice();
  const totalBits = copy.length * 8;
  const normalizedBit = ((bitIndex % totalBits) + totalBits) % totalBits;
  const byteIndex = Math.floor(normalizedBit / 8);
  const bitOffset = normalizedBit % 8;
  const current = copy[byteIndex] ?? 0;
  copy[byteIndex] = current ^ (1 << bitOffset);
  return copy;
}

// --- Deterministic Operational FSM Auditor ---

export type OperationalState = 'INIT' | 'STAGED' | 'SETTLED' | 'ABENDED' | 'REPAIRED';

export const ALLOWED_TRANSITIONS: Record<OperationalState, readonly OperationalState[]> = {
  INIT: ['STAGED', 'ABENDED'],
  STAGED: ['SETTLED', 'ABENDED'],
  ABENDED: ['REPAIRED'],
  REPAIRED: ['STAGED'],
  SETTLED: [],
};

export interface FsmDiagnostic {
  code: 'FSM_VIOLATION';
  stepIndex: number;
  from: OperationalState;
  to: OperationalState;
  message: string;
}

export function verifyStateSequence(
  states: readonly OperationalState[],
): { ok: true } | { ok: false; diagnostics: FsmDiagnostic[] } {
  if (states.length === 0) return { ok: true };

  const diagnostics: FsmDiagnostic[] = [];
  for (let i = 1; i < states.length; i++) {
    const prev = states[i - 1];
    const next = states[i];
    if (!prev || !next) continue;
    const allowed = ALLOWED_TRANSITIONS[prev];
    if (!allowed.includes(next)) {
      diagnostics.push({
        code: 'FSM_VIOLATION',
        stepIndex: i,
        from: prev,
        to: next,
        message: `Illegal state transition at step ${i}: ${prev} -> ${next} is forbidden (allowed: ${allowed.join(', ') || 'none'}).`,
      });
    }
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true };
}
