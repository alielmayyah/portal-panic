// Inline SVG icons copied from the original index.html markup.

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg {...stroke}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" />}
    </svg>
  );
}

export function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg {...stroke}>
      {active ? <path d="M4 9h5V4m6 0v5h5m0 6h-5v5m-6 0v-5H4" /> : <path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5" />}
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M28 5c5 3 4 13-1 21-5 9-12 13-17 10S5 24 10 16C15 7 23 2 28 5Z" stroke="currentColor" strokeWidth="2.5" />
      <path d="M24 11c4 2 3 8 0 14-3 5-7 8-10 6-3-2-3-8 0-13 3-6 7-9 10-7Z" fill="currentColor" opacity=".68" />
      <path d="m24 16-7 4 4 1-5 5M6 12l-2 3m30 11 2-3m-1-13h2M5 30H3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
