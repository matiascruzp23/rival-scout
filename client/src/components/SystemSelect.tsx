import { SYSTEMS } from '../lib/systems';

export function SystemSelect({
  value,
  onChange,
  className,
  emptyLabel = 'Sin especificar',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  emptyLabel?: string;
}) {
  const isCustom = value && !SYSTEMS.includes(value);
  return (
    <select className={className || 'input'} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {isCustom && <option value={value}>{value} (personalizado)</option>}
      {SYSTEMS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
