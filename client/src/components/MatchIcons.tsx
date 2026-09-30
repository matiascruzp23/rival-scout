import type { MatchEventType } from '../types';

export function BallIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="10" fill={color} />
      <path
        d="M12 6.2l3.3 2.4-1.3 3.9H10l-1.3-3.9L12 6.2z M6.3 9.5l1.9-.6 1 3.1-2.4 2.3-2.1-1.4a8 8 0 011.6-3.4z M17.7 9.5a8 8 0 011.6 3.4l-2.1 1.4-2.4-2.3 1-3.1 1.9.6z M9.2 15.2h5.6l1 3.2a7.9 7.9 0 01-7.6 0l1-3.2z"
        fill="white"
        fillOpacity="0.92"
      />
    </svg>
  );
}

export function CardIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={(size * 4) / 3} viewBox="0 0 16 20" className="shrink-0">
      <rect x="1" y="1" width="14" height="18" rx="2" fill={color} />
    </svg>
  );
}

export function EventIcon({ tipo }: { tipo: MatchEventType }) {
  if (tipo === 'gol_favor') return <BallIcon color="#111827" />;
  if (tipo === 'gol_contra') return <BallIcon color="#dc2626" />;
  if (tipo === 'amarilla') return <CardIcon color="#eab308" />;
  return <CardIcon color="#dc2626" />;
}
