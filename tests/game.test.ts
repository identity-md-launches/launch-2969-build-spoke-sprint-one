import test from 'node:test';
import assert from 'node:assert/strict';
import { SprintGame, PRACTICE_KEY, LAST_LIVE_KEY } from '../src/game.ts';
import type { GameDependencies, GameState, StorageLike } from '../src/game.ts';
import { parseReading, attemptKey } from '../src/telemetry.ts';
import type { Reading } from '../src/telemetry.ts';

const initial = Date.parse('2026-11-04T12:00:00Z');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

function setup(storage = new MemoryStorage()) {
  let now = initial;
  let sequence = 0;
  let reads = 0;
  let round: string | null = 'fixture-round-1';
  const scheduled = new Map<ReturnType<typeof setTimeout>, () => void>();
  const result: { current: GameState | null } = { current: null };
  const dependencies: GameDependencies = {
    now: () => now, monotonic: () => now - initial,
    uid: () => `fixture-run-${++sequence}`,
    schedule: (callback) => { const id = sequence as unknown as ReturnType<typeof setTimeout>; scheduled.set(id, callback); return id; },
    cancel: (timer) => { scheduled.delete(timer); }, storage,
    lock: async (callback) => callback(),
    read: async () => {
      reads++;
      return parseReading({
        schemaVersion: 1, installationId: 'fixture-installation', generatedAt: new Date(now).toISOString(),
        ...(round === null ? {} : { roundId: round }),
        measurement: { distanceMm: 100_000 + (reads % 2 === 0 ? 4_000 : 0), observedAt: new Date(now - 1_000).toISOString(), counterEpoch: 'fixture-epoch', freshness: 'online', coreStatus: 'IDLE', provenance: 'hardware', staleAfterSeconds: 120 },
      }, now);
    },
  };
  const game = new SprintGame(dependencies, (state) => { result.current = state; });
  return { game, dependencies, storage, result, reads: () => reads, round: (value: string | null) => { round = value; }, advance: async (ms: number, tick = true) => { now += ms; if (tick) game.tick(); await flush(); }, flush };
}

test('first input counts; no network before input; finish makes exactly the second GET', async () => {
  const t = setup();
  assert.equal(t.reads(), 0);
  t.game.roll(); await flush();
  assert.equal(t.game.state.steps, 1);
  assert.equal(t.reads(), 1);
  t.game.roll(); t.game.roll(); t.game.roll(); t.game.roll();
  await t.advance(19_999);
  assert.equal(t.game.state.phase, 'running');
  await t.advance(1);
  assert.equal(t.reads(), 2);
  assert.equal(t.game.state.phase, 'finished');
  assert.equal(t.game.state.attempt?.gainMm, 4_000);
  assert.equal(t.game.state.attempt?.steps, 5);
  assert.equal(t.game.state.attempt?.winner, 'player');
  const key = t.storage.getItem(LAST_LIVE_KEY)!;
  assert.equal(JSON.parse(t.storage.getItem(key)!).valid, true);
});

test('an input on the deadline does not count and cannot extend the clock', async () => {
  const t = setup(); t.game.roll(); await flush();
  await t.advance(20_000, false); t.game.roll(); await flush();
  assert.equal(t.game.state.attempt?.steps, 1);
  assert.equal(t.reads(), 2);
});

test('same round is refused after reload; changed round permits a new live attempt', async () => {
  const t = setup(); t.game.roll(); await flush(); await t.advance(20_000);
  const restored = new SprintGame(t.dependencies, () => {});
  assert.equal(restored.state.phase, 'finished');
  restored.roll(); await flush();
  assert.equal(restored.state.phase, 'locked');
  assert.match(restored.state.notice, /already used/);
  t.round('fixture-round-2'); restored.roll(); await flush();
  assert.equal(restored.state.phase, 'running');
});

test('UTC-hour fallback refuses a second run, then allows the next hour', async () => {
  const t = setup(); t.round(null); t.game.roll(); await flush(); await t.advance(20_000);
  assert.match(t.storage.getItem(LAST_LIVE_KEY)!, /hour:2026-11-04T12/);
  t.game.roll(); await flush(); assert.equal(t.game.state.phase, 'locked');
  await t.advance(3_600_000); t.game.roll(); await flush();
  assert.equal(t.game.state.phase, 'running');
});

test('practice works offline, is repeatable, and never writes a live result', async () => {
  const t = setup(); t.dependencies.read = async () => { throw new Error('should not fetch'); };
  t.game.selectMode('practice'); t.game.roll(); t.game.roll();
  await t.advance(20_000);
  assert.equal(t.game.state.attempt?.gainMm, 60_000);
  assert.equal(t.game.state.attempt?.winner, 'hamster');
  assert.equal(t.game.state.practiceBest, 2);
  assert.equal(t.storage.getItem(LAST_LIVE_KEY), null);
  assert.equal(JSON.parse(t.storage.getItem(PRACTICE_KEY)!).lastAttempt.mode, 'practice');
  t.game.roll(); assert.equal(t.game.state.phase, 'running');
  assert.equal(t.reads(), 0);
});

test('failed opening request still gets a closing request and yields no invented gain', async () => {
  const t = setup(); let calls = 0; const original = t.dependencies.read;
  t.dependencies.read = async () => { calls++; if (calls === 1) throw new Error('The status request failed (HTTP 503).'); return original(); };
  t.game.roll(); await flush(); await t.advance(20_000);
  assert.equal(calls, 2);
  assert.equal(t.game.state.attempt?.valid, false);
  assert.match(t.game.state.attempt?.reason ?? '', /Opening reading.*503/);
  assert.equal(t.game.state.attempt?.gainMm, null);
  assert.equal(t.game.state.attempt?.winner, null);
});

test('failed closing request voids a reserved round and names the failure', async () => {
  const t = setup(); const original = t.dependencies.read; let calls = 0;
  t.dependencies.read = async () => { if (++calls === 2) throw new Error('The status request timed out after 8 seconds.'); return original(); };
  t.game.roll(); await flush(); await t.advance(20_000);
  assert.equal(t.game.state.attempt?.valid, false);
  assert.match(t.game.state.attempt?.reason ?? '', /Closing reading.*timed out/);
  t.game.roll(); await flush(); assert.equal(t.game.state.phase, 'locked');
});

test('reset epoch, stale data and changed installation all yield void with raw readings preserved', async () => {
  for (const mutation of ['epoch', 'stale', 'installation', 'reset', 'observation']) {
    const t = setup(); const original = t.dependencies.read; let calls = 0;
    t.dependencies.read = async () => {
      const reading = await original();
      if (++calls === 2) {
        if (mutation === 'epoch') reading.counterEpoch = 'fixture-new-epoch';
        if (mutation === 'stale') reading.problem = 'The wheel reading is stale.';
        if (mutation === 'installation') reading.installationId = 'fixture-new-installation';
        if (mutation === 'reset') reading.distanceMm = 0;
        if (mutation === 'observation') reading.observedAt = new Date(initial - 1_000).toISOString();
      }
      return reading;
    };
    t.game.roll(); await flush(); await t.advance(20_000);
    assert.equal(t.game.state.attempt?.valid, false, mutation);
    assert.equal(t.game.state.attempt?.gainMm, null, mutation);
    assert.notEqual(t.game.state.attempt?.start, null);
    assert.notEqual(t.game.state.attempt?.end, null);
  }
});

test('switching to practice ends and locks the live attempt without mixing scores', async () => {
  const t = setup(); t.game.roll(); await flush();
  const key = t.storage.getItem(LAST_LIVE_KEY)!;
  t.game.selectMode('practice');
  assert.equal(JSON.parse(t.storage.getItem(key)!).valid, false);
  assert.match(JSON.parse(t.storage.getItem(key)!).reason, /switched modes/);
  t.game.roll(); await t.advance(20_000);
  assert.equal(t.game.state.attempt?.mode, 'practice');
  assert.equal(JSON.parse(t.storage.getItem(key)!).mode, 'live');
});

test('a delayed opening response cannot cancel or overwrite the new practice run', async () => {
  const t = setup(); const original = t.dependencies.read;
  let release: (reading: Reading) => void = () => {};
  t.dependencies.read = () => new Promise((resolve) => { release = resolve; });
  t.game.roll(); await flush();
  t.game.selectMode('practice'); t.game.roll();
  release(await original()); await flush();
  assert.equal(t.game.state.mode, 'practice');
  assert.equal(t.game.state.phase, 'running');
  await t.advance(20_000);
  assert.equal(t.game.state.attempt?.mode, 'practice');
  assert.equal(t.game.state.attempt?.valid, true);
  const liveKey = attemptKey(await original(), initial);
  assert.equal(JSON.parse(t.storage.getItem(liveKey)!).valid, false);
});

test('unavailable storage and missing locking support fail closed while practice stays available', async () => {
  for (const kind of ['storage', 'lock']) {
    const t = setup();
    if (kind === 'storage') t.dependencies.storage.setItem = () => { throw new Error('blocked'); };
    else t.dependencies.lock = async () => { throw new Error('This browser cannot safely reserve live attempts.'); };
    t.game.roll(); await flush();
    assert.equal(t.game.state.attempt?.valid, false);
    assert.equal(t.game.state.phase, 'finished');
    t.game.selectMode('practice'); t.game.roll(); await t.advance(20_000);
    assert.equal(t.game.state.attempt?.valid, true);
  }
});

test('corrupted saved attempt cannot be silently replaced to allow another race', async () => {
  const t = setup();
  const key = 'spoke-sprint:live:v1:round:fixture-round-1';
  t.storage.setItem(key, '{broken'); t.game.roll(); await flush();
  assert.equal(t.game.state.attempt?.valid, false);
  assert.equal(t.storage.getItem(key), '{broken');
  assert.match(t.game.state.notice, /could not be read or reserved/);
});

test('a throttled closing timer voids an overlong race', async () => {
  const t = setup(); t.game.roll(); await flush(); await t.advance(25_000);
  assert.equal(t.game.state.attempt?.gainMm, null);
  assert.match(t.game.state.attempt?.reason ?? '', /browser delayed/);
});

test('a second tab cannot overwrite an active reserved round', async () => {
  const t = setup(); t.game.roll(); await flush();
  const key = t.storage.getItem(LAST_LIVE_KEY)!;
  const original = t.storage.getItem(key);
  const second = new SprintGame(t.dependencies, () => {});
  assert.equal(t.storage.getItem(key), original, 'viewing a saved run must not mutate another tab’s reservation');
  second.roll(); await flush();
  assert.equal(second.state.phase, 'locked');
  assert.equal(t.storage.getItem(key), original);
  await t.advance(20_000);
  assert.equal(t.game.state.attempt?.valid, true);
});

test('mid-race progress is saved so an interrupted attempt retains its actual step count', async () => {
  const t = setup(); t.game.roll(); await flush(); t.game.roll(); t.game.roll();
  const key = t.storage.getItem(LAST_LIVE_KEY)!;
  assert.equal(JSON.parse(t.storage.getItem(key)!).steps, 3);
  const restored = new SprintGame(t.dependencies, () => {});
  assert.equal(restored.state.steps, 3);
  assert.equal(restored.state.attempt?.gainMm, null);
  assert.equal(restored.state.attempt?.winner, null);
});

test('valid JSON with incomplete saved telemetry is treated as corrupt, without crashing', async () => {
  const t = setup(); const key = 'spoke-sprint:live:v1:round:fixture-round-1';
  const malformed = JSON.stringify({ version: 1, mode: 'live', key, id: 'fixture-corrupt', startedAt: initial, steps: 1, phase: 'finished', valid: true });
  t.storage.setItem(key, malformed); t.storage.setItem(LAST_LIVE_KEY, key);
  const restored = new SprintGame(t.dependencies, () => {});
  assert.match(restored.state.storageWarning ?? '', /cannot be read/);
  restored.roll(); await flush(); assert.equal(restored.state.attempt?.valid, false);
  assert.equal(t.storage.getItem(key), malformed);
});

test('a device-clock jump cannot turn a short real race into a valid 20-second race', async () => {
  const t = setup(); t.dependencies.monotonic = () => 0;
  t.game.roll(); await flush(); await t.advance(20_000);
  assert.equal(t.game.state.attempt?.gainMm, null);
  assert.match(t.game.state.attempt?.reason ?? '', /clock changed/);
});
