// Supabase Auth solo entiende email/password, no "usuario". Para poder
// pedir un nombre de usuario simple en el login, se lo convierte acá a un
// correo inventado bajo un dominio reservado que nunca recibe nada — es
// solo un identificador interno. server/scripts/create-user.ts hace
// exactamente la misma conversión al crear el usuario, así que deben
// coincidir.
const USERNAME_DOMAIN = 'rivalscout.local';

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}
