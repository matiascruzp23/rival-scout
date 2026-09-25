-- Rival Scout — esquema de Supabase (Postgres).
-- Pegar una vez en el SQL Editor del proyecto de Supabase.
--
-- Los ids son `text` (no `uuid`): reusan el generador propio de la app
-- (server/src/supabaseClient.ts:newId), para no tener que remapear
-- referencias al migrar los datos existentes de server/data/db.json.
--
-- RLS: se habilita en cada tabla pero SIN políticas — eso deniega todo
-- acceso a las keys anon/authenticated (las que podría usar un cliente que
-- hable directo con la base). El servidor Express es el único que toca
-- estas tablas, usando la service_role key, que siempre bypassa RLS. El
-- cliente solo usa la key anon para Supabase Auth (login), nunca para leer
-- o escribir estas tablas directamente.

create table if not exists rivals (
  id text primary key,
  nombre text not null,
  proximo_partido_competicion text,
  proximo_partido_instancia text,
  proximo_partido_fecha text,
  proximo_partido_estadio text,
  proximo_partido_condicion text,
  sistema_principal text,
  sistema_alternativo text,
  entrenador text,
  entrenador_ganados integer,
  entrenador_empatados integer,
  entrenador_perdidos integer,
  notas_contexto text,
  nota_xi text,
  escudo_url text,
  -- Código con el que este rival aparece en la planilla de estadísticas de
  -- liga importada (ver league_stats_import) — se completa a mano.
  codigo_ldp text,
  -- Columnas de la planilla LDP elegidas a mano en el modo "Personalizado"
  -- de Gráficos y estadísticas, guardadas para poder mostrar ese mismo
  -- radar en el Informe (si no, la selección se pierde al salir de la
  -- pestaña, es solo estado local del componente).
  grafico_personalizado text[],
  -- Id (auth.users) de quien creó este rival — siempre puede verlo, incluso
  -- si después se restringe con visible_user_ids.
  created_by text,
  -- null = visible para todos (comportamiento por defecto). Una lista
  -- (incluso vacía = solo el creador) restringe qué otros usuarios además
  -- del creador pueden ver este rival.
  visible_user_ids text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torneo_reglas (
  id text primary key,
  rival_id text not null references rivals(id) on delete cascade,
  torneo text not null,
  max_extranjeros integer,
  min_sub21 integer,
  -- Alternativa a min_sub21 para torneos que piden una suma de MINUTOS
  -- Sub-21 por partido (ej. Copa Chile, 130') en vez de una cantidad fija
  -- de jugadores en cancha. Mutuamente excluyente con min_sub21 — si ambas
  -- vienen cargadas, min_minutos_sub21 manda (ver minSub21Efectivo en
  -- client/src/lib/stats.ts).
  min_minutos_sub21 integer,
  exencion_por_seleccionado integer
);
create index if not exists torneo_reglas_rival_id_idx on torneo_reglas(rival_id);

create table if not exists players (
  id text primary key,
  rival_id text not null references rivals(id) on delete cascade,
  nombre text not null,
  dorsal integer,
  posicion text,
  posicion_alternativa text,
  estatura numeric,
  pie text,
  sub21 boolean not null default false,
  sub18 boolean not null default false,
  extranjero boolean not null default false,
  baja boolean not null default false,
  duda boolean not null default false,
  en_seleccion boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists players_rival_id_idx on players(rival_id);

create table if not exists matches (
  id text primary key,
  rival_id text not null references rivals(id) on delete cascade,
  fecha text not null,
  oponente text,
  condicion text,
  goles_favor integer,
  goles_contra integer,
  sistema text,
  sistema_oponente text,
  duracion_minutos integer not null default 90,
  competencia text,
  jornada text,
  notas text,
  nota_tactica text,
  -- Partido en curso de carga en vivo (ver "En Vivo"): mientras es true, se
  -- excluye de las estadísticas agregadas del rival (goles_favor/contra
  -- quedan en null hasta finalizar) y la app redirige a la pantalla de
  -- carga en vivo en vez de a la ficha normal del partido.
  en_vivo boolean not null default false,
  -- Cronómetro del partido en vivo (ver "En Vivo"): persistido acá, no en
  -- localStorage, para que cualquier usuario en cualquier dispositivo (ej.
  -- un viewer de solo lectura) calcule el mismo minuto actual. null =
  -- todavía no se inició. cronometro_base_ms acumula lo corrido en
  -- segmentos ya cerrados (pausas por entretiempo); cronometro_running_since
  -- es el inicio del segmento actual (null = pausado).
  cronometro_base_ms integer,
  cronometro_running_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists matches_rival_id_idx on matches(rival_id);

create table if not exists match_csv (
  match_id text primary key references matches(id) on delete cascade,
  file_name text,
  columns text[] not null default '{}',
  rows jsonb not null default '[]',
  imported_at timestamptz not null default now(),
  excluded_categories text[] not null default '{}'
);

create table if not exists lineup_entries (
  id bigserial primary key,
  match_id text not null references matches(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  posicion text not null,
  x numeric,
  y numeric
);
create index if not exists lineup_entries_match_id_idx on lineup_entries(match_id);
create index if not exists lineup_entries_player_id_idx on lineup_entries(player_id);

create table if not exists substitutions (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  minuto integer not null,
  jugador_sale_id text references players(id) on delete cascade,
  jugador_entra_id text references players(id) on delete cascade,
  posicion_sale text,
  posicion_entra text,
  descripcion text,
  sistema_resultante text,
  layout_resultante jsonb
);
create index if not exists substitutions_match_id_idx on substitutions(match_id);

create table if not exists match_events (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  minuto integer not null,
  tipo text not null,
  jugador_id text references players(id) on delete set null,
  descripcion text
);
create index if not exists match_events_match_id_idx on match_events(match_id);

create table if not exists match_banca (
  match_id text not null references matches(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  primary key (match_id, player_id)
);

create table if not exists match_bajas (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  jugador_id text not null references players(id) on delete cascade,
  tipo text not null,
  motivo text
);
create index if not exists match_bajas_match_id_idx on match_bajas(match_id);

-- Planilla de estadísticas de toda la liga (pestaña "Gráficos y
-- estadísticas"): un único registro compartido entre todos los rivales, no
-- una fila por rival — cada import la reemplaza entera. Mismo criterio de
-- columnas dinámicas que match_csv (las métricas de la planilla no tienen
-- un esquema fijo).
create table if not exists league_stats_import (
  id text primary key default 'current',
  file_name text,
  columns text[] not null default '{}',
  rows jsonb not null default '[]',
  codigo_propio text,
  uploaded_at timestamptz not null default now()
);

-- Planilla de estadísticas INDIVIDUALES de los jugadores de un rival
-- puntual (pestaña "Gráficos y estadísticas" → "Datos individuales"): una
-- fila por jugador de ESE rival (a diferencia de league_stats_import, que
-- es de equipos y compartida entre todos). Una por rival, se reemplaza
-- entera en cada import (upsert por rival_id).
create table if not exists individual_stats_import (
  rival_id text primary key references rivals(id) on delete cascade,
  file_name text,
  columns text[] not null default '{}',
  rows jsonb not null default '[]',
  uploaded_at timestamptz not null default now()
);

-- Sin políticas: deniega todo a anon/authenticated. service_role (el
-- servidor) sigue teniendo acceso completo, RLS no le aplica.
alter table rivals enable row level security;
alter table torneo_reglas enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_csv enable row level security;
alter table lineup_entries enable row level security;
alter table substitutions enable row level security;
alter table match_events enable row level security;
alter table match_banca enable row level security;
alter table match_bajas enable row level security;
alter table individual_stats_import enable row level security;
alter table league_stats_import enable row level security;
