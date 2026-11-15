import type { OrganHeartbeat } from '../organs/stitch-pipeline.ts';

interface AnatomyGraphProps {
  organs: OrganHeartbeat[];
  executionMs: number;
  totalWidth: number;
  onSelectOrgan: (organId: OrganHeartbeat['id']) => void;
}

function statusColor(status: OrganHeartbeat['status']): string {
  if (status === 'healthy') return '#38f29e';
  if (status === 'degraded') return '#f5b942';
  return '#ff4d6d';
}

export function AnatomyGraph({
  organs,
  executionMs,
  totalWidth,
  onSelectOrgan,
}: AnatomyGraphProps) {
  const o1 = organs.find((o) => o.id === 'cobol-parser');
  const o2 = organs.find((o) => o.id === 'packet-verifier');
  const o3 = organs.find((o) => o.id === 'schema-bridge');
  const o4 = organs.find((o) => o.id === 'stitch-pipeline');

  const c1 = statusColor(o1?.status ?? 'degraded');
  const c2 = statusColor(o2?.status ?? 'degraded');
  const c3 = statusColor(o3?.status ?? 'degraded');
  const c4 = statusColor(o4?.status ?? 'degraded');

  const nodes: Array<{
    x: number;
    organ?: OrganHeartbeat;
    color: string;
    shortTitle: string;
    subtitle: string;
  }> = [
    {
      x: 30,
      organ: o1,
      color: c1,
      shortTitle: '1. COBOL AST',
      subtitle: `${totalWidth}B fixed-width`,
    },
    {
      x: 270,
      organ: o2,
      color: c2,
      shortTitle: '2. BINARY CRC-16',
      subtitle: 'XMODEM + FSM Guard',
    },
    {
      x: 510,
      organ: o3,
      color: c3,
      shortTitle: '3. SCHEMA BRIDGE',
      subtitle: 'OpenAPI + ABEND Fix',
    },
    {
      x: 750,
      organ: o4,
      color: c4,
      shortTitle: '4. STITCH LEDGER',
      subtitle: `${executionMs} ms cycle`,
    },
  ];

  return (
    <div className="anatomy-wrapper" aria-label="Frankenstein Organ Stitch Graph">
      <svg viewBox="0 0 980 124" className="anatomy-svg" role="img" aria-label="4-Organ Stitch Pipeline Diagram">
        <defs>
          <filter id="glow-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Stitched suture connectors between organs */}
        {[
          { x1: 230, x2: 270, color: c1 },
          { x1: 470, x2: 510, color: c2 },
          { x1: 710, x2: 750, color: c3 },
        ].map((edge, idx) => (
          <g key={idx}>
            <line
              x1={edge.x1}
              y1={62}
              x2={edge.x2}
              y2={62}
              stroke={edge.color}
              strokeWidth={3}
              strokeDasharray="6 4"
              className="suture-pulse"
            />
            <polygon
              points={`${edge.x2 - 2},62 ${edge.x2 - 10},57 ${edge.x2 - 10},67`}
              fill={edge.color}
            />
          </g>
        ))}

        {nodes.map((node) => {
          const organ = node.organ;
          return (
            <g
              key={node.shortTitle}
              transform={`translate(${node.x}, 18)`}
              onClick={() => organ && onSelectOrgan(organ.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                width={200}
                height={88}
                rx={12}
                fill="#0b1018"
                stroke={node.color}
                strokeWidth={1.6}
                filter="url(#glow-soft)"
              />
              <circle cx={18} cy={22} r={5} fill={node.color} />
              <text
                x={32}
                y={26}
                fill="#e6edf7"
                fontSize="12.5"
                fontWeight="700"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                {node.shortTitle}
              </text>
              <text x={16} y={49} fill="#8b9bb4" fontSize="11.5">
                {node.subtitle}
              </text>
              <text
                x={16}
                y={71}
                fill={node.color}
                fontSize="11"
                fontWeight="600"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                {(organ?.status ?? 'pending').toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
