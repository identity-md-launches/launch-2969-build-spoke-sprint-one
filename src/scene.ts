const spokes = Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-18" x2="0" y2="-116" transform="rotate(${i * 30})" />`).join('');
const treads = Array.from({ length: 32 }, (_, i) => `<line x1="0" y1="-127" x2="0" y2="-136" transform="rotate(${i * 11.25})" />`).join('');

const wheel = (x: number, name: string) => `
  <g transform="translate(${x} 158)">
    <path class="wheel-stand" d="M-34 164 -12 94h24l22 70M-62 164H62" />
    <g class="${name}-wheel" id="${name}-wheel">
      <circle class="wheel-fill" r="136" />
      <circle class="wheel-rim" r="136" />
      <circle class="wheel-inner" r="119" />
      <g class="wheel-spokes">${spokes}</g>
      <g class="wheel-treads">${treads}</g>
      <circle class="wheel-hub" r="15" />
      <circle class="wheel-bolt" r="4" />
    </g>
  </g>`;

export const scene = `
<svg class="arena-art" viewBox="0 0 760 342" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="floor" width="38" height="20" patternUnits="userSpaceOnUse"><path d="M0 0h8" fill="none" stroke="currentColor" stroke-width="1" /></pattern>
    <pattern id="finish-checks" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h6v6H0zm6 6h6v6H6z" fill="currentColor" /></pattern>
  </defs>
  <path class="arena-horizon" d="M10 322h740" />
  <path class="arena-floor" d="M0 325h760v17H0z" fill="url(#floor)" />
  <path class="finish-post" d="M380 39v258" />
  <path class="finish-flag" d="M380 39h24v42h-24z" fill="url(#finish-checks)" />
  ${wheel(185, 'player')}
  ${wheel(575, 'hamster')}
  <g class="player-mark" transform="translate(185 158)">
    <circle r="43" />
    <path d="m4-27-25 31h17l-3 24 28-34H4z" />
  </g>
  <g class="hamster" transform="translate(575 222)">
    <path class="hamster-tail" d="M49 26q26-8 22 8" />
    <ellipse class="hamster-body" cx="9" cy="4" rx="54" ry="42" transform="rotate(-12)" />
    <ellipse class="hamster-belly" cx="-2" cy="14" rx="34" ry="28" />
    <path class="hamster-foot" d="m-10 35-15 6q-9 7 5 8h21M37 29l10 6q12 10-2 11H29" />
    <circle class="hamster-body" cx="-34" cy="-11" r="31" />
    <circle class="hamster-body" cx="-42" cy="-41" r="15" />
    <circle class="hamster-ear" cx="-42" cy="-41" r="8" />
    <path class="hamster-cheek" d="M-61-10q-14 10-2 19l17 2" />
    <circle class="hamster-eye" cx="-43" cy="-14" r="4" />
    <circle class="hamster-nose" cx="-67" cy="1" r="4" />
    <path class="hamster-whisker" d="m-60 9-18-3m19 9-17 5" />
  </g>
</svg>`;

export const wheelIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7m0 4v7M3 12h7m4 0h7M5.6 5.6l5 5m2.8 2.8 5 5m0-12.8-5 5m-2.8 2.8-5 5"/></svg>`;
