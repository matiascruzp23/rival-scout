// Glosario de etiquetas habituales de Sportscode para "situaciones" y
// "tipos de presión", con una glosa breve en lenguaje llano. No inventa
// nada sobre el partido: solo explica qué significa la etiqueta que el
// propio analista ya registró en el CSV.
const GLOSSARY: Record<string, string> = {
  // --- Situaciones de circulación ---
  'Conduccion del central': 'El central avanza con el balón controlado para romper líneas.',
  '3er hombre': 'Combinación de tercer hombre: un jugador da la pared para que el balón llegue a un tercero que rompe líneas.',
  'Laterales altos': 'Los laterales suben con amplitud como parte de la circulación.',
  'Wing interno': 'El extremo se desmarca de afuera hacia adentro, sin balón.',
  'Cambios de frente': 'Cambio de orientación del juego: pase largo transversal de un costado al otro.',
  'Descenso de 9': 'El delantero centro baja a recibir entre líneas.',
  'Descenso de wing': 'El extremo baja a recibir a una posición más retrasada.',
  'Juego directo': 'Salida rápida con balón largo, evitando la construcción corta.',
  Asociaciones: 'Pared o combinación corta entre dos jugadores cercanos.',
  'Pase entre lineas': 'Pase que rompe la línea defensiva rival hacia el mediocampo o ataque.',
  'Delantero cae a banda': 'El delantero se abre a la banda a recibir.',
  'Pasaje del lateral': 'El lateral se desmarca por fuera (sin balón) para ofrecer una vía de salida.',
  'Llegada de 2da linea': 'Un mediocampista llega de atrás hacia el área, de forma sorpresiva.',
  'Movimiento profundo': 'Desmarque de ruptura buscando espacio a la espalda de la defensa.',
  'Movimiento de interno a externo': 'Un interior o mediapunta se desplaza hacia la banda para generar amplitud.',
  'Gana espalda': 'El jugador gana la posición a la espalda del marcador (a diferencia de un movimiento profundo, que es solo el intento).',
  'Lateral por dentro': 'El lateral se interna en vez de ir por la banda.',
  'Central se hace lateral': 'El central se abre y avanza como lateral, no solo se desplaza.',
  'Triangulo en banda': 'Combinación de lateral, extremo y volante interior (o mediapunta) en el costado para progresar.',
  'Intercambio de posiciones': 'Dos jugadores permutan de posición.',
  'Sup. numerica en 2do palo': 'Se genera superioridad numérica en el segundo palo ante un centro.',
  'Centro 3/4': 'Centro desde la banda hacia el área, sin desbordar, desde atrás de la línea del área, a 3/4 de cancha.',
  'Volante a banda': 'El volante se desplaza a ocupar la banda.',
  'Mediapunta en cuadrado': 'El mediapunta se posiciona dentro del cuadrado del medio (entre lateral, extremo, central y volante) como opción interior.',

  // --- Situaciones de presión (vulnerabilidades) ---
  'Libre cuadrado': 'El cuadrado es el espacio entre lateral, extremo, central y mediocentro; un rival queda libre ahí, sin marca directa.',
  'Persiguen movimiento': 'La línea se desordena siguiendo un desmarque rival, dejando espacio libre.',
  'Salta 7': 'El extremo derecho (posición 7) salta a presionar la salida rival.',
  'Salta 11': 'El extremo izquierdo (posición 11) salta a presionar la salida rival.',
  'Salta 10': 'El mediapunta (posición 10) salta a presionar la salida rival.',
  'Salta interno': 'El volante interior (posición 8) salta a presionar la salida rival.',
  'Orienta 9': 'El delantero centro orienta su carrera de presión para tapar un lado o línea de pase, en vez de ir directo al balón.',
  'Presion al arquero': 'La presión llega hasta el arquero rival.',
  'Presion a linea de 3': 'Presión orientada específicamente a una línea de tres centrales.',
  'Central sigue descenso': 'El central sigue al delantero que baja a buscar el balón, abriendo espacio a la espalda.',
  'Lateral sigue descenso': 'El lateral sigue al interior que ataca por dentro, dejando la banda libre.',
  'Libre lado opuesto': 'Queda un jugador libre en el lado contrario al del balón.',
  'Pierde espalda': 'Un defensor pierde la referencia y queda expuesto a la espalda.',
  'Cierran lineas de pase': 'Se tapan las líneas de pase cercanas al jugador con el balón.',
  'Espacio entre lineas': 'Zona libre entre la línea defensiva y la de mediocampo rival.',
  'Wing forma linea de 5': 'El extremo retrocede a sumarse a la línea de fondo, formando una línea de 5.',
  'No emparejan en area': 'No marcan al hombre dentro del área (vulnerabilidad en centros o pelota detenida).',
  'Espalda de la defensa': 'Espacio disponible detrás de la última línea defensiva.',
  'Central a banda': 'Un central se desplaza a cubrir la banda.',
  'Mano a mano': 'El equipo defiende hombre a hombre (1v1) en toda la cancha, sin coberturas ni marcaje zonal.',
  'Lateral con lateral': 'El lateral salta a presionar directamente sobre el lateral rival.',
  'Volante forma linea de 5': 'El volante retrocede a sumarse a la línea de fondo, formando una línea de 5.',
  'Wing op cierra con vc': 'El extremo del lado opuesto cierra hacia adentro junto al volante central, dejando libre su banda.',
};

// Nomenclatura de posición que usa el analista al anotar quién presiona
// (p. ej. "Presiona 9-10"): no son dorsales de jugadores reales, es una
// numeración genérica de roles, igual para cualquier rival.
export const ROLE_NAMES: Record<number, string> = {
  7: 'extremo derecho',
  8: 'volante interior',
  9: 'delantero centro',
  10: 'mediapunta',
  11: 'extremo izquierdo',
};

// Orden de izquierda a derecha en el que se dibujan estos roles cuando
// aparecen combinados en un diagrama.
export const ROLE_ORDER = [11, 9, 10, 8, 7];

export function glossaryFor(tag: string): string | undefined {
  const clean = tag.trim();
  if (GLOSSARY[clean]) return GLOSSARY[clean];
  const presionMatch = clean.match(/^Presiona\s+([\d\-,\s]+)$/i);
  if (presionMatch) {
    const roles = presionMatch[1]
      .split(/[-,\s]+/)
      .filter(Boolean)
      .map((n) => {
        const num = Number(n);
        const nombre = ROLE_NAMES[num];
        return nombre ? `${nombre} (${num})` : `la posición ${num}`;
      });
    return `Presión combinada de estas posiciones: ${roles.join(', ')} sobre la salida rival.`;
  }
  return undefined;
}

// Divide una celda que puede traer varias etiquetas separadas por coma
// (tal como las exporta Sportscode cuando marcan más de una a la vez) en
// etiquetas individuales, para contarlas por separado.
export function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
