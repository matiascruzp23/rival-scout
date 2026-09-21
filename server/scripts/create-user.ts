// Crea un usuario para esta app (o le cambia la contraseña/rol si el
// usuario ya existe). No hay registro público, así que este script es la
// forma de dar de alta gente nueva.
//
// Uso:
//   npx tsx scripts/create-user.ts <usuario> <password> [rol]
//
// <rol> es opcional: "editor" (por defecto, puede ver y editar todo) o
// "viewer" (solo puede ver, el servidor rechaza cualquier escritura suya).
//
// Supabase Auth solo entiende email/password, no "usuario": acá se convierte
// <usuario> a un correo inventado bajo un dominio reservado que nunca recibe
// nada. client/src/lib/username.ts hace la misma conversión al iniciar
// sesión, así que el dominio debe coincidir en ambos lados.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const USERNAME_DOMAIN = 'rivalscout.local';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en server/.env');
  process.exit(1);
}

const [, , usernameArg, password, rolArg] = process.argv;
if (!usernameArg || !password) {
  console.error('Uso: npx tsx scripts/create-user.ts <usuario> <password> [editor|viewer]');
  process.exit(1);
}
const username = usernameArg.trim().toLowerCase();
const email = `${username}@${USERNAME_DOMAIN}`;
const rol = rolArg === 'viewer' ? 'viewer' : 'editor';
const role = rol === 'viewer' ? 'viewer' : undefined; // ausencia de rol = editor (comportamiento de hoy)

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email?.toLowerCase() === email);

  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, {
      password,
      app_metadata: { role },
    });
    if (error) {
      console.error('Error actualizando el usuario:', error.message);
      process.exit(1);
    }
    console.log(`Usuario "${username}" actualizado (contraseña reseteada, rol: ${rol}).`);
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
  console.log(`Usuario "${username}" creado (rol: ${rol}).`);
}

main();
