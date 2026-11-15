# StitchOps Core — Requirements (EARS Syntax)

## Introduction
StitchOps unifies four disparate subsystems—a COBOL Copybook fixed-width batch parser, a binary telemetry packet verifier, a modern JSON/OpenAPI schema synthesizer with ABEND triage, and an interactive Anatomy Workbench—into one deterministic pipeline.

---

### Requirement 1: COBOL Copybook Schema Parsing
**User Story:** As a mainframe migration engineer, I want to parse standard COBOL copybook definitions into typed field layouts, so that fixed-width records can be decoded and validated without manual offset arithmetic.

**Acceptance Criteria:**
- WHEN a valid COBOL copybook containing level numbers (`01`, `05`) and `PIC` clauses (`PIC X(n)`, `PIC 9(n)`, `PIC 9(n)V9(m)`, `PIC S9(n)`) is supplied
  THE SYSTEM SHALL compute exact zero-based byte offsets, lengths, decimal scales, and total record width.
- IF a copybook line contains an unsupported or malformed `PIC` clause
  THE SYSTEM SHALL return a structured diagnostic identifying the 1-based line number and offending token without crashing.

---

### Requirement 2: Fixed-Width Batch Decoding & Round-Trip Serialization
**User Story:** As a batch operator, I want fixed-width mainframe record lines decoded into typed JavaScript values and serialized back deterministically, so that no precision or padding is lost across system boundaries.

**Acceptance Criteria:**
- WHEN a fixed-width record string matching the copybook total width is decoded
  THE SYSTEM SHALL trim trailing spaces on alphanumeric `PIC X` fields and scale implied decimals (`V99`) into exact numeric values.
- IF a record line is shorter or longer than the copybook's expected record width
  THE SYSTEM SHALL emit a `RECORD_WIDTH_MISMATCH` diagnostic including expected and actual byte lengths.
- WHEN any valid decoded record is re-serialized through the copybook formatter
  THE SYSTEM SHALL produce a fixed-width string whose re-decoded values equal the original decoded record.

---

### Requirement 3: Binary Telemetry Frame Verification (CRC-16 & FSM)
**User Story:** As an operations engineer, I want each stitched mainframe record wrapped and verified inside a binary telemetry frame, so that wire corruption or illegal operational state transitions are caught immediately.

**Acceptance Criteria:**
- WHEN encoding a stitched record into a binary telemetry frame (`[0x53,0x54]` magic, version, sequence ID, payload length, payload bytes, big-endian CRC-16/XMODEM)
  THE SYSTEM SHALL compute and append a deterministic CRC-16 checksum covering header metadata and payload.
- IF any bit in a frame header or payload is altered before decoding
  THE SYSTEM SHALL reject the frame with a `CRC_MISMATCH` diagnostic containing expected and actual checksum hex values.
- WHEN a stream of operational events transitions through lifecycle states (`INIT -> STAGED -> SETTLED | ABENDED`)
  THE SYSTEM SHALL flag any forbidden transition (such as `ABENDED -> SETTLED` without `REPAIRED`) as an `FSM_VIOLATION`.

---

### Requirement 4: Schema Synthesis & Legacy ABEND Triage
**User Story:** As an integration developer, I want parsed COBOL copybooks automatically synthesized into OpenAPI/JSON Schema contracts alongside actionable fixes for mainframe `ABEND` codes, so that modern APIs can consume legacy batches safely.

**Acceptance Criteria:**
- WHEN a parsed copybook layout is passed to the schema bridge
  THE SYSTEM SHALL generate a valid JSON Schema (`draft-2020-12`) preserving string `maxLength`, numeric precision hints, and required fields.
- WHEN a record or log contains known mainframe error signatures (`S0C7` Data Exception, `S0C4` Protection Exception, `S322` Timeout, or `CRC_MISMATCH`)
  THE SYSTEM SHALL surface a human-readable root cause explanation and an atomic auto-remediation patch suggestion.

---

### Requirement 5: Interactive Frankenstein Anatomy Workbench
**User Story:** As a user reviewing stitched pipelines, I want a real-time visual workbench where I can inspect organ health, inject faults (bit-flips or malformed COBOL bytes), and replay repairs, so that I can verify end-to-end resilience before production deployment.

**Acceptance Criteria:**
- WHEN a sample or custom workload is loaded into the Anatomy Workbench
  THE SYSTEM SHALL render live status nodes for all four stitched organs, per-record parse traces, binary hex inspection, and synthesized JSON Schema output.
- WHEN the user triggers a fault injection (e.g., byte truncation or binary bit-flip)
  THE SYSTEM SHALL highlight the exact failing organ, record offset, and suggested repair patch within 50ms in the UI.
