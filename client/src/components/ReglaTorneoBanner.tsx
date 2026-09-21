import type { ReglaTorneoCheck } from '../lib/stats';

// El XI estimado ya viene ajustado para cumplir la regla del torneo (ver
// aplicarReglaTorneo en lib/stats.ts); este aviso solo aparece cuando, aun
// así, no se pudo cumplir del todo (ej. no hay suficientes Sub-21
// disponibles para cubrir el mínimo pedido).
export function ReglaTorneoBanner({ check }: { check: ReglaTorneoCheck | null }) {
  if (!check) return null;
  const { regla, extranjerosEnXI, sub21EnXI, minSub21Exigido, cumpleExtranjeros, cumpleSub21 } = check;
  if (cumpleExtranjeros && cumpleSub21) return null;
  return (
    <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
      No se pudo cumplir del todo la regla de {regla.torneo}:{' '}
      {!cumpleExtranjeros && `${extranjerosEnXI} extranjeros en el XI (máx. ${regla.maxExtranjeros}). `}
      {!cumpleSub21 && `solo ${sub21EnXI} Sub-21/Sub-18 disponibles (mín. ${minSub21Exigido}).`}
    </div>
  );
}
