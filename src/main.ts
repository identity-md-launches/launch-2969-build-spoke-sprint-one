import './style.css';
import { SprintGame, browserDependencies } from './game.ts';
import type { Attempt, GameState } from './game.ts';
import { MM_PER_STEP, PRACTICE_GAIN_MM, PRACTICE_LABEL, RACE_MS, STATUS_URL } from './telemetry.ts';
import type { Reading } from './telemetry.ts';
import { scene, wheelIcon } from './scene.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <a class="skip-link" href="#race">Skip to the race</a>
  <div class="shell">
    <header class="site-header">
      <a class="community-link" href="https://squeekchain.com" target="_blank" rel="noreferrer">${wheelIcon}<span>A Squeekchain community game</span></a>
      <a class="help-link" href="#how-to-play">How to play <span aria-hidden="true">↗</span></a>
    </header>
    <main id="race">
      <div class="title-row">
        <div><h1>Spoke Sprint<span class="title-dot" aria-hidden="true">.</span></h1><p class="intro">You against Squeektoshi’s real wheel. Twenty seconds.</p></div>
        <div class="race-length" aria-hidden="true">20<span>seconds<br>to roll</span></div>
      </div>
      <section class="game" aria-label="Wheel race">
        <div class="game-toolbar">
          <div class="mode-controls" role="group" aria-label="Race mode">
            <button type="button" id="live-mode" class="mode-button" aria-pressed="true"><span class="live-dot" aria-hidden="true"></span>Race live</button>
            <button type="button" id="practice-mode" class="mode-button" aria-pressed="false">Practice</button>
          </div>
          <div class="timer-wrap"><span class="timer-caption" id="timer-caption">Time left</span><span id="timer" class="timer" role="timer" aria-label="20 seconds left">20.0<span>s</span></span></div>
        </div>
        <div class="time-track" aria-hidden="true"><div id="time-fill"></div></div>
        <div class="arena">
          <div class="racer-labels">
            <div><span class="racer-name">You</span><span class="racer-score"><strong id="player-distance">0</strong><span>game-meters</span></span></div>
            <div><span class="racer-name">Squeektoshi</span><span class="opponent-score" id="opponent-distance">Measured at the finish</span></div>
          </div>
          <button type="button" class="scene-button" id="scene-roll" aria-label="Roll your wheel one step" aria-describedby="input-hint step-unit">${scene}</button>
          <div class="arena-bottom"><span id="step-count">0 steps</span><span id="race-kind">Real wheel · two readings</span></div>
        </div>
        <div class="controls">
          <p class="mode-label" id="mode-label" hidden>${PRACTICE_LABEL}</p>
          <button type="button" class="roll-button" id="roll" aria-describedby="input-hint step-unit">${wheelIcon}<span id="roll-label">Roll to start</span><span class="button-arrow" aria-hidden="true">→</span></button>
          <p class="input-hint" id="input-hint">Tap the button or scene, or press <kbd>Space</kbd>.</p>
          <p class="step-unit" id="step-unit">1 step = 1 game-meter</p>
          <p class="game-notice" id="game-notice" role="status" aria-live="polite">Your first roll starts the clock.</p>
        </div>
      </section>
      <section class="result" id="result" aria-labelledby="result-heading" tabindex="-1" hidden>
        <div class="result-heading-row"><div><p class="result-mode" id="result-mode"></p><h2 id="result-heading"></h2></div><span class="result-mark" id="result-mark" aria-hidden="true"></span></div>
        <p class="result-reason" id="result-reason"></p>
        <dl class="result-totals"><div><dt>Your distance</dt><dd id="result-player"></dd></div><div><dt id="result-opponent-label">Hamster gain</dt><dd id="result-hamster"></dd></div></dl>
        <p class="result-detail" id="result-comparison"></p>
        <div id="live-receipt" hidden>
          <details class="receipt" id="receipt"><summary>View the two wheel readings <span aria-hidden="true">+</span></summary><div class="receipt-body">
            <p>Raw <code>distanceMm</code> from the status endpoint. No estimated wheel distance.</p>
            <div class="reading-table-wrap"><table class="reading-table"><caption class="sr-only">Opening and closing telemetry readings</caption><thead><tr><th scope="col">Reading</th><th scope="col">Opening</th><th scope="col">Closing</th></tr></thead><tbody id="reading-rows"></tbody></table></div>
            <dl class="receipt-math"><div><dt>Hamster gain</dt><dd id="receipt-gain"></dd></div><div><dt>Player steps</dt><dd id="receipt-steps"></dd></div></dl>
            <p class="receipt-note">1 game-meter = 1,000 mm for comparison. The input window is 20 seconds; hardware observation times can differ.</p>
            <a href="${STATUS_URL}" target="_blank" rel="noreferrer">View the live status endpoint <span aria-hidden="true">↗</span></a>
          </div></details>
        </div>
        <p class="storage-warning" id="storage-warning" hidden></p>
      </section>
      <div class="under-game"><p id="attempt-rule">One live attempt per reported round, saved in this browser.</p><p id="practice-best">Practice as often as you like.</p></div>
      <details class="how-to" id="how-to-play"><summary>How the race works <span aria-hidden="true">+</span></summary><div class="rules-content">
        <div><h2>Every roll counts.</h2><p>The large button, the scene, and each press of Space roll your wheel one fixed step. Holding Space does not repeat. Your first roll starts the 20-second clock.</p><p>Each step is 1 game-meter. For this game, 1 game-meter equals 1,000 mm. The farther distance wins; equal distances are a tie.</p></div>
        <div><h2>Two honest readings.</h2><p>A live race takes one reading from Squeektoshi’s wheel at the start and one at the finish. The difference between the raw distance counters is the hamster’s gain. The scene does not estimate live movement.</p><p>Missing or stale data, a failed request, a changed installation, or a reset counter makes the attempt void. A void attempt has no winner and still uses its round.</p><p>Live attempts use the round ID actually returned by the API, including a clearly labeled last closed round when that is the available ID. With no round ID, the limit is one attempt per UTC hour. You can check for a new ID after finishing.</p></div>
        <div><h2>Practice anytime.</h2><p>${PRACTICE_LABEL}. The fixed simulated hamster gain is 60 game-meters (60,000 mm). Practice needs no network and saves separately from live attempts.</p><p>Scores and limits live only in this browser’s storage. They are not a shared leaderboard. Switching modes ends the current run; leaving or reloading ends a live attempt. Your local device needs the correct time for freshness checks.</p></div>
      </div></details>
    </main>
    <footer><span>A little wheel. A fair race.</span><a href="${STATUS_URL}" target="_blank" rel="noreferrer">Status API <span aria-hidden="true">↗</span></a></footer>
  </div>`;

function element<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
const rollButton = element<HTMLButtonElement>('roll');
const sceneButton = element<HTMLButtonElement>('scene-roll');
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let previousResult: Attempt | null = null;
let lastPhase = '';
let lastAnnouncement = '';

function setText(id: string, text: string) {
  const node = element(id);
  if (node.textContent !== text) node.textContent = text;
}
function display(value: string | number | null | undefined) { return value === null || value === undefined ? 'Unavailable' : String(value); }
function rowsForReading(start: Reading | null, end: Reading | null) {
  const fields: [string, (r: Reading | null) => string][] = [
    ['distanceMm', (r) => r?.distanceMm === null || !r ? 'Unavailable' : `${r.distanceMm} mm`],
    ['Observed at (UTC)', (r) => display(r?.observedAt)],
    ['Wheel status', (r) => display(r?.wheelStatus)],
    ['Telemetry freshness', (r) => display(r?.freshness)],
    ['Stale after', (r) => r?.staleAfterSeconds ? `${r.staleAfterSeconds} seconds` : 'Unavailable'],
    ['Installation ID', (r) => display(r?.installationId)],
    ['Counter epoch', (r) => display(r?.counterEpoch)],
    ['Round ID', (r) => r?.round ? `${r.round.label}: ${r.round.id}` : 'No round ID returned'],
    ['Round field', (r) => display(r?.round?.source)],
    ['Other round references', (r) => r?.roundReferences.slice(1).map((round) => `${round.source}: ${round.id}`).join('; ') || 'None'],
    ['Provenance', (r) => display(r?.provenance)],
    ['Generated at (UTC)', (r) => display(r?.generatedAt)],
    ['Received at (UTC)', (r) => display(r?.receivedAt)],
    ['Validation', (r) => r ? r.problem ?? 'Accepted' : 'No reading received'],
  ];
  const body = element<HTMLTableSectionElement>('reading-rows');
  body.replaceChildren(...fields.map(([label, get]) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = label; tr.append(th);
    for (const reading of [start, end]) { const td = document.createElement('td'); td.textContent = get(reading); tr.append(td); }
    return tr;
  }));
}

function renderResult(attempt: Attempt, warning: string | null) {
  const isPractice = attempt.mode === 'practice';
  const heading = !attempt.valid ? 'Attempt void.' : attempt.winner === 'player' ? 'You went farther.' : attempt.winner === 'hamster' ? 'Squeektoshi went farther.' : 'A wheel-to-wheel tie.';
  setText('result-mode', isPractice ? PRACTICE_LABEL : 'Live race result');
  setText('result-heading', heading);
  setText('result-mark', !attempt.valid ? '∅' : attempt.winner === 'tie' ? '=' : '↗');
  setText('result-reason', attempt.reason ?? (isPractice ? 'A fixed target. A real effort from you.' : 'Compared using the same installation and counter epoch.'));
  setText('result-player', `${number(attempt.steps)} game-meters`);
  setText('result-opponent-label', isPractice ? 'Simulated hamster gain' : 'Hamster gain');
  setText('result-hamster', attempt.gainMm === null ? 'Not comparable' : `${number(attempt.gainMm / MM_PER_STEP)} game-meters`);
  setText('result-comparison', `${number(attempt.steps)} steps × 1 game-meter${attempt.valid ? ` · ${attempt.winner === 'tie' ? 'Equal distances' : `${attempt.winner === 'player' ? 'You' : 'Squeektoshi'} led by ${number(Math.abs(attempt.steps - attempt.gainMm! / MM_PER_STEP))} game-meters`}` : ' · No winner for a void attempt'}.`);
  element('live-receipt').hidden = isPractice;
  if (!isPractice) {
    rowsForReading(attempt.start, attempt.end);
    setText('receipt-gain', attempt.gainMm === null ? 'Not comparable' : `${attempt.end!.distanceMm} − ${attempt.start!.distanceMm} = ${attempt.gainMm} mm`);
    setText('receipt-steps', `${attempt.steps} steps = ${attempt.steps * MM_PER_STEP} mm`);
    // The required raw counters are visible without an additional action at the finish.
    element<HTMLDetailsElement>('receipt').open = true;
  }
  element('storage-warning').hidden = !warning;
  setText('storage-warning', warning ?? '');
}

function render(state: GameState) {
  const active = state.phase === 'running';
  const isPractice = state.mode === 'practice';
  const finished = (state.phase === 'finished' || state.phase === 'locked') ? state.attempt : null;
  const seconds = Math.ceil(state.remainingMs / 100) / 10;
  element('timer').innerHTML = `${seconds.toFixed(1)}<span>s</span>`;
  element('timer').setAttribute('aria-label', `${seconds.toFixed(1)} seconds left`);
  element('time-fill').style.transform = `scaleX(${state.remainingMs / RACE_MS})`;
  element('live-mode').setAttribute('aria-pressed', String(!isPractice));
  element('practice-mode').setAttribute('aria-pressed', String(isPractice));
  setText('player-distance', number(state.steps));
  setText('step-count', `${number(state.steps)} ${state.steps === 1 ? 'step' : 'steps'}`);
  setText('race-kind', isPractice ? 'Simulated wheel · fixed target' : 'Real wheel · two readings');
  element('mode-label').hidden = !isPractice;
  setText('opponent-distance', isPractice ? `${PRACTICE_GAIN_MM / MM_PER_STEP} game-meters · simulated` : finished && finished.gainMm !== null ? `${number(finished.gainMm / MM_PER_STEP)} game-meters` : 'Measured at the finish');
  if (finished && !finished.valid && !isPractice) setText('opponent-distance', 'Reading not comparable');
  const label = state.phase === 'checking' ? 'Checking the finish…' : active ? 'Roll +1' : isPractice && finished ? 'Roll to practice again' : !isPractice && (finished || state.phase === 'locked') ? 'Check next round' : 'Roll to start';
  setText('roll-label', label);
  rollButton.disabled = state.phase === 'checking';
  sceneButton.disabled = state.phase === 'checking';
  rollButton.setAttribute('aria-busy', String(state.phase === 'checking' || state.opening));
  element('result').hidden = !finished;
  if (finished && (previousResult !== finished || lastPhase !== state.phase)) {
    renderResult(finished, state.storageWarning);
    previousResult = finished;
    if (lastPhase === 'running' || lastPhase === 'checking') {
      queueMicrotask(() => element('result').focus());
    }
  }
  const reading = state.attempt?.start;
  if (!isPractice && reading) {
    setText('attempt-rule', reading.round
      ? `${reading.round.label} ${reading.round.id}. One live attempt per ID in this browser.`
      : `No round ID returned. One live attempt per UTC hour (${new Date(state.attempt!.startedAt).toISOString().slice(0, 13)}:00 UTC).`);
  } else setText('attempt-rule', 'One live attempt per reported round; UTC hour if no ID is returned.');
  setText('practice-best', state.practiceBest === null ? 'Practice as often as you like.' : `Practice best in this browser: ${number(state.practiceBest)} steps.`);
  if (lastAnnouncement !== state.notice) {
    setText('game-notice', state.notice);
    lastAnnouncement = state.notice;
  }
  element('player-wheel').style.transform = reducedMotion.matches ? 'rotate(0deg)' : `rotate(${state.steps * 24}deg)`;
  // No simulated progress is presented for the real wheel.
  element('hamster-wheel').style.transform = isPractice && !reducedMotion.matches ? `rotate(${(1 - state.remainingMs / RACE_MS) * 600}deg)` : 'rotate(0deg)';
  document.body.dataset.phase = state.phase;
  document.body.dataset.mode = state.mode;
  lastPhase = state.phase;
}

const game = new SprintGame(browserDependencies(), render);
rollButton.addEventListener('click', () => game.roll());
sceneButton.addEventListener('click', () => game.roll());
element('practice-mode').addEventListener('click', () => game.selectMode('practice'));
element('live-mode').addEventListener('click', () => game.selectMode('live'));
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement;
  if (target.closest('a, input, textarea, select, summary, [contenteditable="true"]') ||
      (target.closest('button') && target.closest('button') !== rollButton && target.closest('button') !== sceneButton)) return;
  event.preventDefault();
  if (!event.repeat) game.roll();
});
document.querySelector('.help-link')!.addEventListener('click', () => { element<HTMLDetailsElement>('how-to-play').open = true; });
window.addEventListener('pagehide', () => game.dispose());
document.addEventListener('visibilitychange', () => game.tick());
setInterval(() => game.tick(), 50);
