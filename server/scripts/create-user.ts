// Crea un usuario de Supabase Auth para esta app (o le cambia el rol si el
// email ya existe). No hay registro público, así que este script es la
// forma de dar de alta gente nueva.
//
// Uso:
//   npx tsx scripts/create-user.ts <email> <password> [rol]
//
// <rol> es opcional: "editor" (por defecto, puede ver y editar todo) o
// "viewer" (solo puede ver, el servidor rechaza cualquier escritura suya).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en server/.env');
  process.exit(1);
}

const [, , email, password, rolArg] = process.argv;
if (!email || !password) {
  console.error('Uso: npx tsx scripts/create-user.ts <email> <password> [editor|viewer]');
  process.exit(1);
}
const rol = rolArg === 'viewer' ? 'viewer' : 'editor';
const role = rol === 'viewer' ? 'viewer' : undefined; // ausencia de rol = editor (comportamiento de hoy)

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, {
      password,
      app_metadata: { role },
    });
    if (error) {
      console.error('Error actualizando el usuario:', error.message);
      process.exit(1);
    }
    console.log(`Usuario ${email} actualizado (contraseña reseteada, rol: ${rol}).`);
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });
  if (error) {
    console.error('Error creando el usuario:', error.message);
    process.exit(1);
  }
  console.log(`Usuario ${email} creado (rol: ${rol}).`);
}

main();
