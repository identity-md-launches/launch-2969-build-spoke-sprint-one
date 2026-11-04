import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReading, readRounds, continuityProblem, attemptKey, compare } from '../src/telemetry.ts';

const now = Date.parse('2026-11-04T12:00:00Z');
function payload(overrides: Record<string, unknown> = {}, root: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, installationId: 'fixture-installation', generatedAt: new Date(now).toISOString(),
    measurement: { distanceMm: 100_000, observedAt: new Date(now - 1_000).toISOString(), counterEpoch: 'fixture-epoch', freshness: 'online', coreStatus: 'IDLE', provenance: 'hardware', staleAfterSeconds: 120, ...overrides },
    ...root,
  };
}

test('actual v1 field structure preserves raw counters, status, time, installation and epoch', () => {
  const reading = parseReading(payload({}, { oracle: { latestClosure: { lastRound: '1289', firstRound: '1288' } } }), now);
  assert.equal(reading.problem, null);
  assert.equal(reading.distanceMm, 100_000);
  assert.equal(reading.wheelStatus, 'IDLE');
  assert.equal(reading.observedAt, new Date(now - 1_000).toISOString());
  assert.equal(reading.round?.id, '1289');
  assert.equal(reading.round?.label, 'Last closed round');
  assert.equal(reading.roundReferences.length, 2);
});

test('explicit round IDs take precedence; historical references retain source and label', () => {
  const rounds = readRounds({ roundId: '0', oracle: { latestClosure: { lastRound: '42' } }, builder: { anchor: { settledThroughRound: '41' } } });
  assert.equal(rounds[0]?.id, '0');
  assert.equal(rounds[1]?.source, 'oracle.latestClosure.lastRound');
  assert.equal(rounds[2]?.label, 'Last settled round');
  assert.deepEqual(readRounds({ revision: 'not-a-round', generatedAt: 'not-a-round' }), []);
});

test('missing and unsupported schemas never produce a usable reading', () => {
  for (const invalid of [null, [], {}, { schemaVersion: 2 }, { distanceMm: 1 }]) {
    assert.match(parseReading(invalid, now).problem!, /schema/);
  }
  for (const invalid of [-1, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) {
    assert.match(parseReading(payload({ distanceMm: invalid }), now).problem!, /distanceMm/);
  }
  assert.match(parseReading(payload({ counterEpoch: null }), now).problem!, /epoch/);
  assert.match(parseReading(payload({}, { installationId: null }), now).problem!, /installation/);
  assert.match(parseReading(payload({ coreStatus: undefined }), now).problem!, /status/);
});

test('stale, offline, future and simulated readings are rejected', () => {
  assert.match(parseReading(payload({ observedAt: new Date(now - 121_000).toISOString() }), now).problem!, /stale/);
  assert.match(parseReading(payload({ observedAt: new Date(now - 31_000).toISOString(), staleAfterSeconds: 30 }), now).problem!, /stale/);
  assert.match(parseReading(payload({ freshness: 'offline' }), now).problem!, /offline/);
  assert.match(parseReading(payload({ observedAt: new Date(now + 10_000).toISOString() }), now).problem!, /future/);
  assert.match(parseReading(payload({ provenance: 'simulated' }), now).problem!, /hardware/);
  assert.match(parseReading(payload({ observedAt: 'yesterday' }), now).problem!, /time/);
});

test('comparison rejects reset counters, changed installation/epoch, and unchanged observations', () => {
  const start = parseReading(payload(), now);
  const later = (measurement: Record<string, unknown> = {}, root: Record<string, unknown> = {}) => parseReading(payload({ observedAt: new Date(now + 19_000).toISOString(), distanceMm: 104_250, ...measurement }, root), now + 20_000);
  assert.equal(continuityProblem(start, later()), null);
  assert.match(continuityProblem(start, later({ distanceMm: 0 }))!, /backwards/);
  assert.match(continuityProblem(start, later({ counterEpoch: 'another-fixture-epoch' }))!, /epoch/);
  assert.match(continuityProblem(start, later({}, { installationId: 'another-fixture-installation' }))!, /installation/);
  assert.match(continuityProblem(start, later({ observedAt: start.observedAt }))!, /did not advance/);
  assert.equal(continuityProblem(start, later({ distanceMm: 100_000 })), null, 'stationary hardware can honestly gain zero');
});

test('no round means a UTC hour, independent of local timezone', () => {
  assert.equal(attemptKey(null, Date.parse('2026-11-04T22:59:59+10:30')), 'spoke-sprint:live:v1:hour:2026-11-04T12');
  const reading = parseReading(payload({}, { roundId: 'round/42' }), now);
  assert.equal(attemptKey(reading, now), 'spoke-sprint:live:v1:round:round%2F42');
});

test('comparison uses exactly 1,000 mm per step and handles ties', () => {
  assert.equal(compare(5, 4_999), 'player');
  assert.equal(compare(5, 5_000), 'tie');
  assert.equal(compare(5, 5_001), 'hamster');
});
