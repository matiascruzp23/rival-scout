# Instrucciones para Claude

## Git

Al terminar cada tarea (cambios de código completos y verificados), hacer
commit y push a `origin/main` automáticamente, sin esperar a que el usuario
lo pida cada vez. Usar un mensaje de commit descriptivo del cambio.

No aplica a cambios a medio hacer, exploración, o tareas que el usuario
todavía no confirmó — solo al cierre de una tarea ya terminada.

Antes de commitear, correr el build real (`npm run build --prefix client`),
no solo `tsc --noEmit`: es lo mismo que corre Vercel al desplegar.

## Qué hace la app

Rival Scout es una herramienta interna de scouting de rivales para el cuerpo
técnico de Universidad de Chile. Por cada rival permite:

- **Dashboard**: resumen del rival (últimos resultados, XI estimado, etc.).
- **Jugadores**: plantel con posiciones, importación desde planilla, ficha
  individual (estadísticas propias + Wyscout, radar por posición, comparación
  entre dos jugadores, campograma de posiciones jugadas).
- **Partidos**: últimos partidos con XI, goles, tarjetas, bajas, sustituciones
  y CSV de Sportscode importado por partido (incluye ida/vuelta de Copa).
- **En Vivo**: seguimiento de un partido en curso (también para viewers).
- **XI y Rotaciones** / **Sustituciones**: XI más usado, rotaciones y cambios
  (incluidos cambios tácticos de sistema).
- **Análisis**: análisis de los CSV de Sportscode (situaciones tácticas con
  diagramas, resolución manual de registros ambiguos).
- **Gráficos y estadísticas**: radares comparativos contra la liga (LDP),
  con datos de una planilla de SharePoint.
- **Informe**: informe imprimible / exportable a PDF (A4 apaisado).

Además: calendario de rivales, reglas de torneo (p. ej. minutos Sub-21),
rivales privados compartidos con usuarios específicos, y roles
editor/viewer.

## Estructura del proyecto

```
client/            Frontend: React 19 + Vite + TypeScript + Tailwind v4
  src/pages/       Una página por pestaña (RivalLayout define las pestañas)
  src/components/  Componentes (Pitch, RadarChart, editores, modales…)
  src/lib/         Lógica pura: stats, formaciones, posiciones, radar, CSV…
  src/api.ts       Cliente HTTP de la API (adjunta el token de Supabase)
  src/supabaseClient.ts  Supabase Auth del lado cliente
server/            API: Express 5 + TypeScript
  src/app.ts       Todas las rutas /api/* (rivales, jugadores, partidos, CSV,
                   league-stats)
  src/auth.ts      requireAuth: valida sesión y bloquea escrituras de viewers
  src/csv.ts, leagueStats.ts, playerImport.ts  Parseo de CSV/Excel
  supabase/schema.sql  Esquema de la base (se pega en el SQL Editor)
  scripts/create-user.ts   Alta de usuarios (no hay registro público)
  scripts/migrate-to-supabase.ts  Migración puntual histórica
api/index.ts       Función serverless de Vercel que envuelve la app Express
scripts/           Scripts puntuales (seed de demo, migración de posiciones)
vercel.json        Build, output y rewrites del deploy
```

Datos: todo vive en Supabase (Postgres + Storage para escudos), nada en el
repo. El servidor usa la `service_role` key (bypassa RLS; las tablas no
tienen políticas para anon/authenticated), así que **toda la autorización
pasa por el servidor**.

## Cómo correrla

```bash
npm run install-all   # primera vez: instala server/ y client/
npm run dev           # API en :3001 + web en :5173 (Vite proxea /api)
```

Crear antes `server/.env` y `client/.env` a partir de sus `.env.example`.
También existe la config `rival-scout` en `.claude/launch.json` para el
preview.

Usuarios: `cd server && npx tsx scripts/create-user.ts <usuario> <password> [editor|viewer] [--restringido]`.
`--restringido` hace que no vea los rivales públicos, solo los compartidos
explícitamente con él (así está el usuario `demo`, viewer).

Rival de demostración: `cd server && npx tsx scripts/seed-demo-rival.ts`
recrea desde cero "Cordillera FC" (datos inventados, todos los campos
rellenos) compartido solo con `demo`.
El login es por usuario; se convierte a un correo ficticio
`<usuario>@rivalscout.local` (ver `client/src/lib/username.ts`).

## Despliegue

Vercel, un solo proyecto y un solo dominio para cliente + API:

- `installCommand`: `npm run install-all`
- `buildCommand`: `npm run build --prefix client` (`tsc -b && vite build`)
- `outputDirectory`: `client/dist`
- `/api/*` se reescribe a `api/index.ts` (Express); el resto a `index.html`
  (SPA).

Se despliega automáticamente al hacer push a `main`. Las variables de
entorno se configuran en el dashboard de Vercel.

## Variables de entorno

`server/.env` (y Vercel):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LEAGUE_STATS_URL` — opcional; link de descarga directa de la planilla de
  liga en SharePoint (tiene un valor por defecto en `server/src/app.ts`).
- `API_PORT` — opcional, solo local (por defecto 3001).

`client/.env` (y Vercel):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Decisiones de diseño

- **Idioma**: toda la UI, los comentarios y los mensajes de commit en
  español (Chile). Terminología de fútbol local (XI, citados, bajas, etc.).
- **Estilo**: sobrio y denso en información, tipo herramienta de trabajo.
  Solo modo claro (`color-scheme: light`).
- **Colores** (paleta de Tailwind):
  - Fondo `slate-50`, tarjetas blancas con borde `slate-200`; texto
    `slate-800`, secundario `slate-500`/`slate-400`.
  - Acento principal **`emerald-700`** (botón primario, links, pestaña
    activa, foco de inputs).
  - `red-600/700` para peligro/errores, `amber-50/200/700` para avisos y
    ejes invertidos del radar ("menos es mejor").
  - Cancha: degradado verde `#1f7a3d → #1a6b35` con líneas blancas
    semitransparentes.
- **Componentes base** (en `client/src/index.css`, dentro de
  `@layer components` para que las utilidades de Tailwind puedan
  sobrescribirlos): `.btn-primary`, `.btn-secondary`, `.btn-danger`,
  `.input`, `.label`, `.card`, `.badge`. Tablas con estilo global
  (encabezados en mayúsculas chicas, sticky).
- **Gráficos en SVG propio** (sin librerías de charts): `Pitch`,
  `RadarChart` (escala independiente por eje contra el máximo de la liga,
  ejes invertidos donde menos es mejor), `TacticalDiagram`,
  `SituationDiagrams`, `PlayerPositionPitch`.
- **Impresión**: el Informe se imprime en A4 apaisado; clases
  `.no-print`, `.informe-page`, `.informe-section` controlan saltos de
  página. `@page` va anidado en `@media print` a propósito (ver comentario
  en `index.css`).
- **Sin IA externa**: las conclusiones/reglas son deterministas.
- Logo del club (`client/public/logo-u.png`) arriba a la izquierda,
  oculto al imprimir.

## Pendientes e ideas

- No hay tests automáticos (ni en client ni en server).
- `server/src/app.ts` concentra todas las rutas (~1000 líneas): candidato a
  dividir por recurso.
- El proxy de Vite todavía declara `/uploads`, resto de antes de migrar los
  escudos a Supabase Storage.
- `LEAGUE_STATS_URL` tiene un link de SharePoint hardcodeado como valor por
  defecto; idealmente vivir solo en variables de entorno.
- `server/.env.example` no incluye las variables opcionales
  (`LEAGUE_STATS_URL`, `API_PORT`).
- (Agregar acá nuevas ideas a medida que surjan.)
