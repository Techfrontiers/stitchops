import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Binary,
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  ShieldAlert,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react';
import { AnatomyGraph } from './components/AnatomyGraph.tsx';
import { SAMPLE_SCENARIOS } from './data/samples.ts';
import { encodeTelemetryFrame } from './organs/packet-verifier.ts';
import {
  runStitchPipeline,
  type FaultInjectionMode,
  type OrganHeartbeat,
} from './organs/stitch-pipeline.ts';

type InspectorTab = 'traces' | 'hex' | 'schema';

const FAULT_OPTIONS: Array<{ value: FaultInjectionMode; label: string }> = [
  { value: 'NONE', label: 'No Fault (Healthy Batch)' },
  { value: 'S0C7_CORRUPTION', label: 'Inject S0C7 Data Exception (?X bytes)' },
  { value: 'TRUNCATE_RECORD', label: 'Inject Truncated Record Width' },
  { value: 'BINARY_BIT_FLIP', label: 'Inject Binary CRC-16 Bit-Flip' },
  { value: 'FSM_BYPASS', label: 'Inject Illegal FSM Bypass (ABENDED -> SETTLED)' },
];

export default function App() {
  const initialScenario = SAMPLE_SCENARIOS[0]!;
  const [scenarioId, setScenarioId] = useState(initialScenario.id);
  const [copybookSource, setCopybookSource] = useState(initialScenario.copybook);
  const [batchLines, setBatchLines] = useState(initialScenario.batchLines);
  const [faultMode, setFaultMode] = useState<FaultInjectionMode>('NONE');
  const [autoRepair, setAutoRepair] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>('traces');

  const report = useMemo(
    () =>
      runStitchPipeline({
        copybookSource,
        batchLines,
        faultMode,
        autoRepair,
      }),
    [copybookSource, batchLines, faultMode, autoRepair],
  );

  const handleScenarioChange = (nextId: string) => {
    const found = SAMPLE_SCENARIOS.find((s) => s.id === nextId);
    if (!found) return;
    setScenarioId(found.id);
    setCopybookSource(found.copybook);
    setBatchLines(found.batchLines);
    setFaultMode('NONE');
    setAutoRepair(false);
  };

  const handleOrganClick = (organId: OrganHeartbeat['id']) => {
    if (organId === 'packet-verifier') {
      setActiveTab('hex');
    } else if (organId === 'schema-bridge') {
      setActiveTab('schema');
    } else {
      setActiveTab('traces');
    }
  };

  const handleFileUpload = (
    event: ChangeEvent<HTMLInputElement>,
    target: 'copybook' | 'batch',
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (target === 'copybook') {
        setCopybookSource(content);
      } else {
        setBatchLines(content.trimEnd());
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleDownloadOpenApi = () => {
    if (!report.contract) return;
    const blob = new Blob([JSON.stringify(report.contract.openApiSnippet, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(report.schema?.recordName ?? 'stitchops').toLowerCase()}-openapi.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBinaryFrame = () => {
    const firstDecoded = report.traces.find((t) => t.status === 'SETTLED' && t.decoded)?.decoded;
    if (!firstDecoded) return;
    const frameBytes = encodeTelemetryFrame(1, {
      recordName: report.schema?.recordName ?? 'STITCH-REC',
      seq: 1,
      fields: firstDecoded,
    });
    const exactBuffer = frameBytes.buffer.slice(
      frameBytes.byteOffset,
      frameBytes.byteOffset + frameBytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([exactBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(report.schema?.recordName ?? 'stitchops').toLowerCase()}-frame1.stf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-badge">
            <Zap size={20} />
          </div>
          <div>
            <h1>StitchOps — Frankenstein Operations Workbench</h1>
            <p>COBOL Copybook · Binary CRC-16 Telemetry · FSM Ledger · OpenAPI 3.1 Synthesizer</p>
          </div>
        </div>

        <div className="controls-bar">
          <select
            id="scenario-select"
            name="scenario"
            aria-label="Sample Workload"
            className="pill-select"
            value={scenarioId}
            onChange={(e) => handleScenarioChange(e.target.value)}
          >
            {SAMPLE_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            id="fault-select"
            name="faultMode"
            aria-label="Fault Injection"
            className="pill-select"
            value={faultMode}
            onChange={(e) => {
              setFaultMode(e.target.value as FaultInjectionMode);
              setAutoRepair(false);
            }}
          >
            {FAULT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`action-btn ${autoRepair ? 'active-acid' : faultMode !== 'NONE' ? 'active-danger' : ''}`}
            onClick={() => setAutoRepair((prev) => !prev)}
          >
            <Wrench size={15} />
            {autoRepair ? 'Auto-Repair: ON' : 'Trigger Auto-Repair'}
          </button>
        </div>
      </header>

      <AnatomyGraph
        organs={report.organs}
        executionMs={report.stats.executionMs}
        totalWidth={report.schema?.totalWidth ?? 0}
        onSelectOrgan={handleOrganClick}
      />

      <section className="organ-grid" aria-label="Stitched Organ Heartbeats">
        {report.organs.map((organ) => (
          <div
            key={organ.id}
            className={`organ-card ${organ.status}`}
            onClick={() => handleOrganClick(organ.id)}
            style={{ cursor: 'pointer' }}
          >
            <div className="organ-head">
              <span>{organ.label}</span>
              <span className={`status-tag ${organ.status}`}>{organ.status}</span>
            </div>
            <div className="organ-meta">{organ.techStack}</div>
            <div style={{ marginTop: 6, fontSize: '0.82rem' }}>{organ.detail}</div>
          </div>
        ))}
      </section>

      <main className="workspace-grid">
        <section className="panel">
          <h2 className="panel-title">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileCode2 size={16} />
              Organ 1 Input · COBOL Copybook & Fixed-Width Batch
            </span>
            <div className="toolbar-inline">
              <span className="organ-meta">
                {report.schema ? `${report.schema.totalWidth} bytes/record` : 'Invalid Copybook'}
              </span>
              <label htmlFor="copybook-upload" className="file-upload-label">
                <Upload size={13} />
                Load .cpy
                <input
                  id="copybook-upload"
                  name="copybookUpload"
                  type="file"
                  accept=".cpy,.cbl,.cob,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileUpload(e, 'copybook')}
                />
              </label>
            </div>
          </h2>

          <textarea
            id="copybook-editor"
            name="copybookSource"
            aria-label="COBOL Copybook"
            className="code-editor"
            rows={8}
            value={copybookSource}
            onChange={(e) => setCopybookSource(e.target.value)}
          />

          <h3 className="panel-title" style={{ marginTop: 4 }}>
            <span>Fixed-Width Mainframe Batch Lines</span>
            <div className="toolbar-inline">
              <span className="organ-meta">{report.stats.totalRecords} records</span>
              <label htmlFor="batch-upload" className="file-upload-label">
                <Upload size={13} />
                Load .dat
                <input
                  id="batch-upload"
                  name="batchUpload"
                  type="file"
                  accept=".dat,.txt,.log"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileUpload(e, 'batch')}
                />
              </label>
            </div>
          </h3>

          <textarea
            id="batch-editor"
            name="batchLines"
            aria-label="Batch Records"
            className="code-editor"
            rows={5}
            value={batchLines}
            onChange={(e) => setBatchLines(e.target.value)}
          />

          {report.copybookDiagnostics.length > 0 && (
            <div className="triage-box">
              <strong>Copybook Parse Diagnostics</strong>
              {report.copybookDiagnostics.map((d, idx) => (
                <div key={idx} style={{ marginTop: 4 }}>
                  [{d.code}] {d.message}
                </div>
              ))}
            </div>
          )}

          {report.triage.length > 0 && (
            <div className="triage-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <ShieldAlert size={16} />
                Organ 3 · Automated ABEND & Integrity Triage
              </div>
              {report.triage.map((item) => (
                <div key={item.signature} style={{ marginTop: 8 }}>
                  <div>
                    <strong>[{item.signature}]</strong> {item.title}
                  </div>
                  <div className="organ-meta" style={{ marginTop: 2 }}>
                    {item.rootCause}
                  </div>
                  <div style={{ marginTop: 4, color: '#38f29e' }}>
                    Patch: {item.patchHint}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="tab-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="toolbar-inline">
              <button
                type="button"
                className={`action-btn ${activeTab === 'traces' ? 'active-acid' : ''}`}
                onClick={() => setActiveTab('traces')}
              >
                <Activity size={15} />
                Stitched Traces ({report.stats.settledCount}/{report.stats.totalRecords})
              </button>
              <button
                type="button"
                className={`action-btn ${activeTab === 'hex' ? 'active-acid' : ''}`}
                onClick={() => setActiveTab('hex')}
              >
                <Binary size={15} />
                Binary CRC-16 Frames
              </button>
              <button
                type="button"
                className={`action-btn ${activeTab === 'schema' ? 'active-acid' : ''}`}
                onClick={() => setActiveTab('schema')}
              >
                <Cpu size={15} />
                Synthesized OpenAPI 3.1
              </button>
            </div>

            <div className="toolbar-inline">
              <button
                type="button"
                className="file-upload-label"
                onClick={handleDownloadBinaryFrame}
                disabled={report.stats.settledCount === 0}
              >
                <Download size={13} />
                Export .stf
              </button>
              <button
                type="button"
                className="file-upload-label"
                onClick={handleDownloadOpenApi}
                disabled={!report.contract}
              >
                <Download size={13} />
                Export OpenAPI
              </button>
            </div>
          </div>

          {activeTab === 'traces' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.traces.map((trace) => (
                <div
                  key={trace.lineNumber}
                  className={`trace-card ${trace.status === 'ABENDED' ? 'abended' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>
                      Record #{trace.lineNumber} · FSM: {trace.stateHistory.join(' → ')}
                    </strong>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: trace.status === 'SETTLED' ? '#38f29e' : '#ff4d6d',
                        fontWeight: 700,
                      }}
                    >
                      {trace.status === 'SETTLED' ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <AlertTriangle size={14} />
                      )}
                      {trace.status}
                    </span>
                  </div>

                  <div className="organ-meta" style={{ marginTop: 4 }}>
                    Raw ({trace.rawLine.length}B): <code>{trace.rawLine}</code>
                    {trace.crcHex ? ` · CRC-16: ${trace.crcHex}` : ''}
                    {trace.roundTripMatch ? ' · Round-Trip: EXACT' : ''}
                  </div>

                  {trace.decoded && (
                    <pre className="mono-box">{JSON.stringify(trace.decoded, null, 2)}</pre>
                  )}

                  {trace.diagnostics.length > 0 && (
                    <pre className="mono-box" style={{ color: '#ff96a8' }}>
                      {trace.diagnostics.map((d) => `[${d.code}] ${d.message}`).join('\n')}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'hex' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.traces.map((trace) => (
                <div key={trace.lineNumber} className="trace-card">
                  <strong>
                    Frame #{trace.lineNumber} ({trace.frameBytesLength} bytes)
                    {trace.crcHex ? ` · CRC-16/XMODEM ${trace.crcHex}` : ''}
                  </strong>
                  <pre className="mono-box">{trace.frameHexPreview}</pre>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'schema' && (
            <div>
              <div className="organ-meta" style={{ marginBottom: 6 }}>
                Auto-synthesized JSON Schema (2020-12) & OpenAPI 3.1 contract derived from COBOL Copybook AST:
              </div>
              <pre className="mono-box">
                {report.contract
                  ? JSON.stringify(report.contract.openApiSnippet, null, 2)
                  : 'Fix Copybook errors to generate OpenAPI contract.'}
              </pre>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
