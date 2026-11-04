import {
  RACE_MS, PRACTICE_GAIN_MM, attemptKey, compare, continuityProblem, getReading,
} from './telemetry.ts';
import type { Reading, Winner } from './telemetry.ts';

export type Mode = 'live' | 'practice';
export type Phase = 'ready' | 'running' | 'checking' | 'finished' | 'locked';
export interface Attempt {
  version: 1;
  mode: Mode;
  id: string;
  key: string;
  startedAt: number;
  finishedAt: number | null;
  steps: number;
  start: Reading | null;
  end: Reading | null;
  gainMm: number | null;
  winner: Winner | null;
  phase: 'running' | 'finished';
  reason: string | null;
  valid: boolean;
}
export interface GameState {
  mode: Mode;
  phase: Phase;
  steps: number;
  remainingMs: number;
  notice: string;
  attempt: Attempt | null;
  opening: boolean;
  practiceBest: number | null;
  storageWarning: string | null;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface GameDependencies {
  now: () => number;
  monotonic: () => number;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
  read: () => Promise<Reading>;
  storage: StorageLike;
  lock: <T>(callback: () => T) => Promise<T>;
  uid: () => string;
}

export const PRACTICE_KEY = 'spoke-sprint:practice:v1';
export const LAST_LIVE_KEY = 'spoke-sprint:live:v1:last';
const PENDING_LIVE_KEY = 'spoke-sprint:live:v1:pending';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The status request failed.';

function storedReading(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const r = value as Reading;
  const nullableString = (value: unknown) => value === null || typeof value === 'string';
  const validRound = (value: unknown) => value !== null && typeof value === 'object' &&
    ['id', 'source', 'label'].every((key) => typeof (value as Record<string, unknown>)[key] === 'string');
  return (r.distanceMm === null || (Number.isSafeInteger(r.distanceMm) && r.distanceMm >= 0)) &&
    ['installationId', 'counterEpoch', 'observedAt', 'generatedAt', 'freshness', 'wheelStatus', 'provenance', 'problem'].every((key) => nullableString(r[key as keyof Reading])) &&
    (r.staleAfterSeconds === null || (Number.isFinite(r.staleAfterSeconds) && r.staleAfterSeconds > 0)) &&
    typeof r.receivedAt === 'string' && (r.round === null || validRound(r.round)) &&
    Array.isArray(r.roundReferences) && r.roundReferences.every(validRound);
}

function storedAttempt(value: string | null): Attempt | null {
  if (!value) return null;
  const item: unknown = JSON.parse(value);
  if (!item || typeof item !== 'object') throw new Error('Invalid saved attempt');
  const attempt = item as Attempt;
  if (attempt.version !== 1 || attempt.mode !== 'live' || typeof attempt.key !== 'string' ||
      !attempt.key.startsWith('spoke-sprint:live:v1:') || typeof attempt.id !== 'string' ||
      !Number.isFinite(attempt.startedAt) || !Number.isSafeInteger(attempt.steps) || attempt.steps < 0 ||
      !['running', 'finished'].includes(attempt.phase) || typeof attempt.valid !== 'boolean' ||
      !(attempt.finishedAt === null || Number.isFinite(attempt.finishedAt)) ||
      !(attempt.reason === null || typeof attempt.reason === 'string') ||
      !(attempt.gainMm === null || (Number.isSafeInteger(attempt.gainMm) && attempt.gainMm >= 0)) ||
      !(attempt.winner === null || ['player', 'hamster', 'tie'].includes(attempt.winner)) ||
      !storedReading(attempt.start) || !storedReading(attempt.end) ||
      (attempt.valid && (attempt.gainMm === null || attempt.winner === null || !attempt.start || !attempt.end))) {
    throw new Error('Invalid saved attempt');
  }
  return attempt;
}

export function browserDependencies(): GameDependencies {
  let localSequence = 0;
  return {
    now: () => Date.now(), monotonic: () => performance.now(),
    schedule: (callback, delay) => setTimeout(callback, delay), cancel: (timer) => clearTimeout(timer),
    read: getReading,
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    lock: async (callback) => {
      if (!navigator.locks) throw new Error('This browser cannot safely reserve live attempts. Use practice or a browser with Web Locks support.');
      return navigator.locks.request('spoke-sprint:live-admission:v1', callback);
    },
    uid: () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++localSequence}`,
  };
}

export class SprintGame {
  state: GameState = {
    mode: 'live', phase: 'ready', steps: 0, remainingMs: RACE_MS,
    notice: 'Your first roll starts the clock.', attempt: null, opening: false,
    practiceBest: null, storageWarning: null,
  };
  private dependencies: GameDependencies;
  private changed: (state: GameState) => void;
  private run: Attempt | null = null;
  private monoStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private openingTask: Promise<void> | null = null;
  private interrupted = new Set<string>();

  constructor(dependencies: GameDependencies, changed: (state: GameState) => void) {
    this.dependencies = dependencies;
    this.changed = changed;
    try {
      const practice: unknown = JSON.parse(dependencies.storage.getItem(PRACTICE_KEY) ?? 'null');
      if (practice && typeof practice === 'object' && 'bestSteps' in practice && Number.isSafeInteger(practice.bestSteps) && Number(practice.bestSteps) >= 0) {
        this.state.practiceBest = Number(practice.bestSteps);
      }
    } catch { this.state.storageWarning = 'Practice scores cannot be read in this browser.'; }
    try {
      const key = dependencies.storage.getItem(LAST_LIVE_KEY);
      const previous = key?.startsWith('spoke-sprint:live:v1:') ? storedAttempt(dependencies.storage.getItem(key)) : null;
      if (previous) {
        if (previous.phase === 'running') {
          previous.phase = 'finished';
          previous.valid = false;
          previous.reason = 'This saved attempt was interrupted or is still open in another tab. Its round remains reserved.';
          previous.finishedAt = dependencies.now();
          previous.gainMm = null;
          previous.winner = null;
        }
        this.state.attempt = previous;
        this.state.phase = 'finished';
        this.state.steps = previous.steps;
        this.state.remainingMs = 0;
        this.state.notice = 'Saved live attempt. Check whether the reported round has changed, or play practice.';
      }
    } catch { this.state.storageWarning = 'Saved live attempts cannot be read. Live races need working browser storage; practice is available.'; }
    this.emit();
  }

  private emit() { this.changed({ ...this.state }); }

  selectMode(mode: Mode) {
    if (mode === 'live' && this.state.mode === 'live' && ['running', 'checking'].includes(this.state.phase)) return;
    this.interrupt('You switched modes before the attempt finished.');
    this.state.mode = mode;
    this.state.phase = 'ready';
    this.state.steps = 0;
    this.state.remainingMs = RACE_MS;
    this.state.attempt = null;
    this.state.opening = false;
    this.state.notice = mode === 'practice' ? 'Fixed target: 60 game-meters. Your first roll starts the clock.' : 'Your first roll starts the clock.';
    this.emit();
  }

  roll() {
    if (this.state.phase === 'checking') return;
    if (this.state.phase === 'running') {
      if (this.elapsed() >= RACE_MS) { void this.finish(); return; }
      this.state.steps++;
      if (this.run) this.run.steps = this.state.steps;
      if (this.run?.mode === 'live' && !this.state.opening) this.persist(this.run);
      this.emit();
      return;
    }
    if (this.state.mode === 'live' && this.openingTask) return;
    this.start();
  }

  private elapsed() {
    // The larger clock also catches suspended tabs; repeated inputs cannot extend a race.
    return this.run ? Math.max(this.dependencies.monotonic() - this.monoStart, this.dependencies.now() - this.run.startedAt, 0) : 0;
  }

  tick() {
    if (this.state.phase !== 'running') return;
    this.state.remainingMs = Math.max(0, RACE_MS - this.elapsed());
    if (!this.state.remainingMs) void this.finish();
    else this.emit();
  }

  private start() {
    const now = this.dependencies.now();
    const mode = this.state.mode;
    const run: Attempt = {
      version: 1, mode, id: this.dependencies.uid(), key: mode === 'live' ? attemptKey(null, now) : PRACTICE_KEY,
      startedAt: now, finishedAt: null, steps: 1, start: null, end: null,
      gainMm: null, winner: null, phase: 'running', reason: null, valid: false,
    };
    this.run = run;
    this.monoStart = this.dependencies.monotonic();
    this.state.phase = 'running';
    this.state.steps = 1;
    this.state.remainingMs = RACE_MS;
    this.state.attempt = run;
    this.state.opening = mode === 'live';
    this.state.notice = mode === 'live' ? 'Taking the opening wheel reading. Keep rolling.' : 'Race the fixed simulated target: 60 game-meters.';
    this.timer = this.dependencies.schedule(() => { void this.finish(); }, RACE_MS);
    if (mode === 'live') {
      this.openingTask = this.openLive(run).finally(() => { this.openingTask = null; });
    }
    this.emit();
  }

  private async openLive(run: Attempt) {
    // Reserve a short admission marker BEFORE the network request, including reloads/tabs.
    let admitted = false;
    try {
      await this.dependencies.lock(() => {
        const pending = this.dependencies.storage.getItem(PENDING_LIVE_KEY);
        if (pending) {
          const previous = storedAttempt(pending);
          if (previous && this.dependencies.now() - previous.startedAt < 30_000) {
            throw new Error('Another live attempt is starting in this browser. Wait for it to finish, or play practice.');
          }
        }
        this.dependencies.storage.setItem(PENDING_LIVE_KEY, JSON.stringify(run));
        admitted = true;
      });
    } catch (error) {
      run.reason = errorText(error).startsWith('This browser') || errorText(error).startsWith('Another live')
        ? errorText(error) : 'Browser storage is unavailable or full. A live attempt cannot be reserved. Practice is available.';
    }
    if (!admitted) {
      this.completeVoid(run, run.reason!);
      return;
    }
    try { run.start = await this.dependencies.read(); }
    catch (error) { run.reason = `Opening reading: ${errorText(error)}`; }
    run.key = attemptKey(run.start, run.startedAt);
    try {
      const previous = await this.dependencies.lock(() => {
        const saved = this.dependencies.storage.getItem(run.key);
        if (saved) return storedAttempt(saved);
        this.dependencies.storage.setItem(run.key, JSON.stringify(run));
        this.dependencies.storage.setItem(LAST_LIVE_KEY, run.key);
        return null;
      });
      if (previous) {
        this.interrupted.add(run.id);
        if (this.run === run) {
          this.stopTimer();
          this.run = null;
          this.state.phase = 'locked';
          this.state.steps = previous.steps;
          this.state.remainingMs = 0;
          this.state.attempt = previous;
          this.state.opening = false;
          this.state.notice = run.start?.round
            ? `You already used your live attempt for ${run.start.round.label.toLowerCase()} ${run.start.round.id}. Check again after that ID changes, or play practice.`
            : `You already used your live attempt for UTC hour ${new Date(run.startedAt).toISOString().slice(0, 13)}:00. Check again next hour, or play practice.`;
          this.emit();
        }
        return;
      }
    } catch {
      run.reason = 'The saved attempt could not be read or reserved. Live results need working browser storage. Practice is available.';
      this.completeVoid(run, run.reason);
      return;
    } finally {
      try {
        await this.dependencies.lock(() => {
          const marker = this.dependencies.storage.getItem(PENDING_LIVE_KEY);
          if (marker && storedAttempt(marker)?.id === run.id) this.dependencies.storage.setItem(PENDING_LIVE_KEY, '');
        });
      } catch { /* A failed admission cannot produce a valid result. */ }
    }
    if (this.interrupted.has(run.id)) {
      this.completeVoid(run, run.reason ?? 'You switched modes before the attempt finished.');
      return;
    }
    if (this.run === run) {
      this.state.opening = false;
      this.state.notice = run.reason ?? run.start?.problem ?? 'Opening reading saved. Keep rolling until the clock ends.';
      this.emit();
    }
  }

  private stopTimer() {
    if (this.timer !== null) this.dependencies.cancel(this.timer);
    this.timer = null;
  }

  private persist(run: Attempt) {
    try {
      if (run.mode === 'live') {
        const saved = storedAttempt(this.dependencies.storage.getItem(run.key));
        if (saved?.id !== run.id) throw new Error('Live attempt reservation changed.');
        this.dependencies.storage.setItem(run.key, JSON.stringify(run));
        this.dependencies.storage.setItem(LAST_LIVE_KEY, run.key);
      } else {
        const bestSteps = Math.max(this.state.practiceBest ?? 0, run.steps);
        this.dependencies.storage.setItem(PRACTICE_KEY, JSON.stringify({ version: 1, bestSteps, lastAttempt: run }));
        this.state.practiceBest = bestSteps;
      }
    } catch {
      if (run.mode === 'live') {
        run.valid = false; run.gainMm = null; run.winner = null;
        run.reason = 'The live attempt could not be saved or its reservation changed. No live result can be confirmed. Practice is available.';
      }
      this.state.storageWarning = 'This result could not be saved in browser storage.';
    }
  }

  private completeVoid(run: Attempt, reason: string) {
    run.reason = reason; run.valid = false; run.gainMm = null; run.winner = null;
    run.phase = 'finished'; run.finishedAt = this.dependencies.now();
    // Only write to an owned reservation; admission errors must not overwrite another run.
    try {
      const saved = storedAttempt(this.dependencies.storage.getItem(run.key));
      if (saved?.id === run.id) this.persist(run);
    } catch { this.state.storageWarning = 'This result could not be saved in browser storage.'; }
    if (this.run === run) {
      this.stopTimer(); this.run = null;
      this.state.phase = 'finished'; this.state.attempt = run;
      this.state.remainingMs = 0; this.state.opening = false;
      this.state.notice = reason;
      this.emit();
    }
  }

  private async finish() {
    const run = this.run;
    if (!run || this.state.phase !== 'running') return;
    const finishDelay = this.elapsed() - RACE_MS;
    const clockDifference = Math.abs((this.dependencies.now() - run.startedAt) - (this.dependencies.monotonic() - this.monoStart));
    this.stopTimer();
    this.state.phase = 'checking'; this.state.remainingMs = 0;
    this.state.notice = run.mode === 'live' ? 'Time. Taking the closing wheel reading.' : 'Time. Comparing the practice distances.';
    this.emit();
    if (run.mode === 'live') {
      // Dispatch the second GET at the deadline, even if the first GET failed.
      const closing = this.dependencies.read().then((reading) => { run.end = reading; }, (error: unknown) => {
        run.reason ??= `Closing reading: ${errorText(error)}`;
      });
      await Promise.all([this.openingTask, closing]);
      if (this.interrupted.has(run.id) || this.run !== run) return;
      run.reason ??= clockDifference > 1_500 ? 'The device clock changed or the browser paused; the 20-second race window could not be verified.'
        : finishDelay > 1_500 ? 'The browser delayed the closing request; the 20-second race window could not be verified.' : continuityProblem(run.start, run.end);
      if (!run.reason) run.gainMm = run.end!.distanceMm! - run.start!.distanceMm!;
    } else run.gainMm = PRACTICE_GAIN_MM;
    run.valid = !run.reason && run.gainMm !== null;
    run.winner = run.valid ? compare(run.steps, run.gainMm!) : null;
    run.phase = 'finished'; run.finishedAt = this.dependencies.now();
    this.persist(run);
    this.state.phase = 'finished'; this.state.attempt = run; this.state.opening = false;
    const outcome = run.winner === 'player' ? 'You went farther.' : run.winner === 'hamster' ? 'Squeektoshi went farther.' : 'Equal distances. It’s a tie.';
    this.state.notice = run.reason ?? `${outcome} ${run.mode === 'live' ? 'Live result saved in this browser.' : 'Practice result. The hamster distance was simulated.'}`;
    this.run = null;
    this.emit();
  }

  private interrupt(reason: string) {
    const run = this.run;
    if (!run) return;
    this.stopTimer();
    this.interrupted.add(run.id);
    if (run.mode === 'live') this.completeVoid(run, reason);
    this.run = null;
  }

  dispose() {
    this.interrupt('The page closed before the live attempt finished.');
    this.stopTimer();
  }
}
