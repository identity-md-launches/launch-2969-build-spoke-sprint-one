export const STATUS_URL = 'https://api.squeekchain.com/v1/status';
export const RACE_MS = 20_000;
export const MM_PER_STEP = 1_000;
export const PRACTICE_GAIN_MM = 60_000;
export const PRACTICE_LABEL = 'Practice — simulated, not live';

export interface RoundReference {
  id: string;
  source: string;
  label: string;
}

export interface Reading {
  distanceMm: number | null;
  installationId: string | null;
  counterEpoch: string | null;
  observedAt: string | null;
  generatedAt: string | null;
  freshness: string | null;
  wheelStatus: string | null;
  provenance: string | null;
  staleAfterSeconds: number | null;
  round: RoundReference | null;
  roundReferences: RoundReference[];
  receivedAt: string;
  problem: string | null;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const string = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;
const id = (value: unknown): string | null =>
  string(value) ?? (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : null);
const timestamp = (value: unknown): string | null => {
  const text = string(value);
  return text && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(text) && Number.isFinite(Date.parse(text)) ? text : null;
};

/** Only explicit identifiers are used; historical references retain their source labels. */
export function readRounds(payload: unknown): RoundReference[] {
  const root = record(payload);
  const round = record(root.round);
  const currentRound = record(root.currentRound);
  const oracle = record(root.oracle);
  const closure = record(oracle.latestClosure);
  const anchor = record(record(root.builder).anchor);
  const submission = record(record(root.settlementQueue).latestSubmission);
  const candidates: [unknown, string, string][] = [
    [root.roundId, 'roundId', 'Round'],
    [currentRound.id, 'currentRound.id', 'Current round'],
    [round.id, 'round.id', 'Round'],
    [round.roundId, 'round.roundId', 'Round'],
    [closure.lastRound, 'oracle.latestClosure.lastRound', 'Last closed round'],
    [anchor.settledThroughRound, 'builder.anchor.settledThroughRound', 'Last settled round'],
    [submission.settledThroughRound, 'settlementQueue.latestSubmission.settledThroughRound', 'Last submitted round'],
    [closure.firstRound, 'oracle.latestClosure.firstRound', 'First round in latest closure'],
  ];
  return candidates.flatMap(([value, source, label]) => {
    const valueId = id(value);
    return valueId === null ? [] : [{ id: valueId, source, label }];
  });
}

export function parseReading(payload: unknown, receivedAtMs: number): Reading {
  const root = record(payload);
  const measurement = record(root.measurement);
  const distance = measurement.distanceMm;
  const rounds = readRounds(root);
  const reading: Reading = {
    distanceMm: typeof distance === 'number' && Number.isSafeInteger(distance) && distance >= 0 ? distance : null,
    installationId: string(root.installationId),
    counterEpoch: string(measurement.counterEpoch),
    observedAt: timestamp(measurement.observedAt),
    generatedAt: timestamp(root.generatedAt),
    freshness: string(measurement.freshness),
    wheelStatus: string(measurement.coreStatus),
    provenance: string(measurement.provenance),
    staleAfterSeconds: typeof measurement.staleAfterSeconds === 'number' && Number.isFinite(measurement.staleAfterSeconds) && measurement.staleAfterSeconds > 0 ? measurement.staleAfterSeconds : null,
    round: rounds[0] ?? null,
    roundReferences: rounds,
    receivedAt: new Date(receivedAtMs).toISOString(),
    problem: null,
  };
  if (root.schemaVersion !== 1) reading.problem = 'The status schema is missing or unsupported (expected schemaVersion 1).';
  else if (reading.distanceMm === null) reading.problem = 'The status response is missing a valid distanceMm counter.';
  else if (!reading.installationId) reading.problem = 'The status response is missing the installation ID.';
  else if (!reading.counterEpoch) reading.problem = 'The status response is missing the counter epoch; continuity cannot be verified.';
  else if (!reading.observedAt || !reading.generatedAt) reading.problem = 'The status response is missing a valid observation or generation time.';
  else if (!reading.freshness || !reading.wheelStatus || !reading.staleAfterSeconds) reading.problem = 'The status response is missing the wheel status or freshness information.';
  else if (reading.provenance !== 'hardware') reading.problem = 'The status response does not identify a real hardware measurement.';
  else if (reading.freshness !== 'online') reading.problem = `The wheel telemetry is ${reading.freshness}; a fresh online reading is required.`;
  else {
    const ageMs = receivedAtMs - Date.parse(reading.observedAt);
    const generationAgeMs = receivedAtMs - Date.parse(reading.generatedAt);
    const maxAgeMs = Math.min(reading.staleAfterSeconds, 120) * 1_000;
    if (ageMs > maxAgeMs || generationAgeMs > maxAgeMs) reading.problem = `The wheel reading is stale (older than ${maxAgeMs / 1_000} seconds).`;
    else if (ageMs < -5_000 || generationAgeMs < -5_000) reading.problem = 'The status time is in the future. Check this device’s clock before the next round.';
  }
  return reading;
}

export async function getReading(): Promise<Reading> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(STATUS_URL, {
      method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`The status request failed (HTTP ${response.status}).`);
    let body: unknown;
    try { body = await response.json(); }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new Error('The status endpoint returned invalid JSON.');
    }
    return parseReading(body, Date.now());
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The status request timed out after 8 seconds.');
    if (error instanceof Error && error.message.startsWith('The status')) throw error;
    throw new Error('The status request failed. Check your connection; the endpoint may also be unavailable.');
  } finally { clearTimeout(timeout); }
}

export function continuityProblem(start: Reading | null, end: Reading | null): string | null {
  if (!start || !end) return 'A wheel reading is unavailable.';
  if (start.problem) return `Opening reading: ${start.problem}`;
  if (end.problem) return `Closing reading: ${end.problem}`;
  if (start.installationId !== end.installationId) return 'The wheel installation changed during the race.';
  if (start.counterEpoch !== end.counterEpoch) return 'The counter epoch changed; the wheel counter may have reset.';
  if (end.distanceMm! < start.distanceMm!) return 'The distance counter went backwards; the wheel counter reset.';
  if (Date.parse(end.observedAt!) <= Date.parse(start.observedAt!)) return 'The wheel observation did not advance during the race.';
  return null;
}

export function attemptKey(reading: Reading | null, startedAtMs: number): string {
  return reading?.round
    ? `spoke-sprint:live:v1:round:${encodeURIComponent(reading.round.id)}`
    : `spoke-sprint:live:v1:hour:${new Date(startedAtMs).toISOString().slice(0, 13)}`;
}

export type Winner = 'player' | 'hamster' | 'tie';
export function compare(steps: number, gainMm: number): Winner {
  const playerMm = steps * MM_PER_STEP;
  return playerMm > gainMm ? 'player' : playerMm < gainMm ? 'hamster' : 'tie';
}
