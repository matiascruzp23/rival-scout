import { POSITION_LABELS } from '../lib/positions';

export function PositionSelect({
  value,
  onChange,
  className,
  allowEmpty = true,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  allowEmpty?: boolean;
}) {
  const isCustom = value && !POSITION_LABELS.includes(value);
  return (
    <select className={className || 'input'} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">Sin posición</option>}
      {isCustom && <option value={value}>{value} (personalizado)</option>}
      {POSITION_LABELS.map((label) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
    </select>
  );
}
