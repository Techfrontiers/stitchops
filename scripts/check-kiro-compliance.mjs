import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const requiredPaths = [
  'LICENSE',
  'README.md',
  '.gitignore',
  '.kiro/steering/product.md',
  '.kiro/steering/tech.md',
  '.kiro/steering/structure.md',
  '.kiro/specs/stitchops-core/requirements.md',
  '.kiro/specs/stitchops-core/design.md',
  '.kiro/specs/stitchops-core/tasks.md',
  '.kiro/hooks/test-on-save.json',
  '.kiro/hooks/kiroween-guard.json',
  '.kiro/settings/mcp.json',
];

const failures = [];

for (const rel of requiredPaths) {
  if (!existsSync(resolve(root, rel))) {
    failures.push(`Missing required Kiroween file: ${rel}`);
  }
}

const gitignorePath = resolve(root, '.gitignore');
if (existsSync(gitignorePath)) {
  const lines = readFileSync(gitignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (lines.some((line) => line === '.kiro' || line === '.kiro/' || line === '/.kiro' || line === '/.kiro/')) {
    failures.push('.gitignore ignores .kiro/, which violates Kiroween 2026 rules!');
  }
}

if (failures.length > 0) {
  console.error('Kiroween compliance check FAILED:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Kiroween 2026 compliance check PASSED (.kiro/ tracked, LICENSE present, specs/hooks/steering valid).');
