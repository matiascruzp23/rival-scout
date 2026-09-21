import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en server/.env');
}

// Cliente con la service_role key: bypassa RLS. Solo lo usa este servidor
// (nunca se expone al cliente), que es el único que toca la base de datos.
export const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
