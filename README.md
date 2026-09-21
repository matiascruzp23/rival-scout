# Rival Scout

Aplicación para organizar informes de rival: últimos 10 partidos, jugadores, XI, rotaciones y sustituciones (incluyendo cambios tácticos), con importación de CSV de Sportscode.

## Primera vez

```bash
npm run install-all
```

Después, crea `server/.env` y `client/.env` a partir de sus respectivos
`.env.example`, con los datos de tu proyecto de Supabase:

- `server/.env`: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
- `client/.env`: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

El esquema de base de datos está en `server/supabase/schema.sql` (se pega
una vez en el SQL Editor del proyecto de Supabase). El login no tiene
registro público: el usuario se crea a mano desde el dashboard de Supabase,
en Authentication → Users.

## Uso diario

```bash
npm run dev
```

Esto levanta el servidor (API) en `http://localhost:3001` y la aplicación web en `http://localhost:5173`. Abre esa segunda URL en el navegador.

Para detener, `Ctrl+C` en la terminal.

## Datos

Toda la información (rivales, jugadores, partidos, XI, sustituciones y los CSV importados) se guarda en Supabase (Postgres), no en este repositorio.

## Estructura

- `client/` — interfaz web (React + Vite + TypeScript + Tailwind), con login vía Supabase Auth.
- `server/` — API (Express) que valida la sesión y lee/escribe en Supabase (Postgres + Storage para los escudos).
