import { Link } from 'react-router-dom';

// Escudo del club, mostrado arriba a la izquierda en el encabezado de cada
// página. No se imprime: el informe ya muestra el escudo del rival, no el
// del club propio.
export function AppLogo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`no-print shrink-0 ${className}`} title="Rival Scout">
      <img src="/logo-u.png" alt="Universidad de Chile" className="w-10 h-10 object-contain" />
    </Link>
  );
}
