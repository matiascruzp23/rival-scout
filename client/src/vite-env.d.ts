/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // URL base de la API en producción (ej. https://rival-scout-server.vercel.app/api).
  // Sin definir en desarrollo: se usa '/api' relativo (proxy de Vite).
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
