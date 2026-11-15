export interface SampleScenario {
  id: string;
  name: string;
  subtitle: string;
  copybook: string;
  batchLines: string;
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: 'treasury-settlement',
    name: 'Core Banking Treasury Settlement (COBOL -> Binary -> OpenAPI)',
    subtitle: '30-byte fixed-width ledger with signed implied decimals (PIC S9(6)V99)',
    copybook: `      * CORE BANKING SETTLEMENT COPYBOOK
       01  TX-SETTLE-REC.
           05  TX-ID            PIC X(8).
           05  ACCT-CODE        PIC X(6).
           05  CHANNEL-NUM      PIC 9(4).
           05  SETTLE-AMT       PIC S9(6)V99.
           05  CURRENCY-CD      PIC X(3).`,
    batchLines: [
      'TX000101TREAS10042+00125050USD',
      'TX000102RETAIL0108-00004525EUR',
      'TX000103WIRE010999+05000000JPY',
    ].join('\n'),
  },
  {
    id: 'freight-telemetry',
    name: 'Cold-Chain Rail Telemetry Batch',
    subtitle: 'Signed sensor temperatures + manifest IDs from legacy AS/400 exporter',
    copybook: `       01  SENSOR-PING-REC.
           05  CONTAINER-ID     PIC X(10).
           05  HUB-ID           PIC X(4).
           05  TEMP-CELSIUS     PIC S9(2)V99.
           05  PRESSURE-KPA     PIC 9(4).`,
    batchLines: [
      'CONT-88412SIN1-18500101',
      'CONT-88413BKK2+04250103',
      'CONT-88414TYO9-20100099',
    ].join('\n'),
  },
  {
    id: 'insurance-claims-batch',
    name: 'Insurance Claims Batch Processing (S322 Checkpointing)',
    subtitle: 'Long-running legacy batch with checkpoint recovery simulation',
    copybook: `       01  CLAIM-BATCH-REC.
           05  CLAIM-ID         PIC X(10).
           05  POLICY-NUM       PIC X(12).
           05  CLAIM-AMT        PIC S9(7)V99.
           05  STATUS-CODE      PIC X(2).`,
    batchLines: [
      'CLM0000001POL-88901234+001250500AC',
      'CLM0000002POL-88901235-000045250RE',
      'CLM0000003POL-88901236+050000000SE',
    ].join('\n'),
  },
];
