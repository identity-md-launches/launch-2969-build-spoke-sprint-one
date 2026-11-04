import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { STATUS_URL, parseReading, continuityProblem } from '../src/telemetry.ts';

// Development-only diagnostic. curl uses this host's HTTPS transport; the game uses browser fetch.
const exec = promisify(execFile);
async function read() {
  const { stdout } = await exec('curl', ['--fail-with-body', '--silent', '--show-error', '--max-time', '8', '-H', 'Accept: application/json', '-H', 'Cache-Control: no-cache', STATUS_URL], { maxBuffer: 1_048_576 });
  return parseReading(JSON.parse(stdout), Date.now());
}
const start = await read();
await new Promise((done) => setTimeout(done, 20_000));
const end = await read();
const problem = continuityProblem(start, end);
const gainMm = problem ? null : end.distanceMm - start.distanceMm;
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/api-pair.json', JSON.stringify({
  kind: 'Real public API readings via curl, about 20 seconds apart; not browser CORS verification',
  checkedAt: new Date().toISOString(), start, end, gainMm, problem,
}, null, 2) + '\n');
console.log(JSON.stringify({ openingMm: start.distanceMm, closingMm: end.distanceMm, gainMm, problem }));
