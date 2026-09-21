import type { NextFunction, Request, Response } from 'express';
import { supabase } from './supabaseClient.js';

// Exige una sesión válida de Supabase Auth (el token que el cliente adjunta
// como Authorization: Bearer <access_token>, ver client/src/api.ts). No hay
// distinción de usuarios más allá de "hay sesión o no" — la app es de un
// solo usuario, así que no hace falta ningún alcance por fila.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Sesión inválida o expirada' });

  next();
}
