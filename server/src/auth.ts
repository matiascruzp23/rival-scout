import type { NextFunction, Request, Response } from 'express';
import { supabase } from './supabaseClient.js';

// Exige una sesión válida de Supabase Auth (el token que el cliente adjunta
// como Authorization: Bearer <access_token>, ver client/src/api.ts). El rol
// vive en app_metadata (solo lo puede fijar un admin vía service_role, el
// usuario no puede cambiárselo a sí mismo — ver scripts/create-user.ts).
// Sin rol, o con cualquier rol que no sea "viewer", el usuario puede
// escribir: el modelo por defecto sigue siendo "cualquiera con sesión edita
// todo", igual que antes de que existieran los roles.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Sesión inválida o expirada' });

  const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
  const isViewer = data.user.app_metadata?.role === 'viewer';
  if (isWrite && isViewer) {
    return res.status(403).json({ error: 'Tu usuario es de solo lectura' });
  }

  next();
}
