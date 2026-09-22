import type { ImportedPlayerRow, ImportPreviewResult, Match, MatchCsv, Player, Rival, RivalDetail, RivalListItem } from './types';
import { supabase } from './supabaseClient';

// '/api' relativo: en desarrollo lo resuelve el proxy de Vite
// (vite.config.ts) hacia el servidor local; en producción (Vercel), cliente
// y API viven en el mismo dominio (ver api/[...path].ts), así que también
// resuelve directo, sin necesitar una URL aparte.
const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (options?.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (data.session?.access_token) headers['Authorization'] = `Bearer ${data.session.access_token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || 'Error de solicitud');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  rivals: {
    list: () => request<RivalListItem[]>('/rivals'),
    get: (id: string) => request<RivalDetail>(`/rivals/${id}`),
    create: (data: { nombre: string; sistemaPrincipal?: string; sistemaAlternativo?: string; entrenador?: string }) =>
      request<Rival>('/rivals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Rival>) =>
      request<Rival>(`/rivals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/rivals/${id}`, { method: 'DELETE' }),
    uploadEscudo: (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<Rival>(`/rivals/${id}/escudo`, { method: 'POST', body: form });
    },
    removeEscudo: (id: string) => request<Rival>(`/rivals/${id}/escudo`, { method: 'DELETE' }),
  },
  players: {
    list: (rivalId: string) => request<Player[]>(`/rivals/${rivalId}/players`),
    create: (rivalId: string, data: Partial<Player>) =>
      request<Player>(`/rivals/${rivalId}/players`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Player>) =>
      request<Player>(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/players/${id}`, { method: 'DELETE' }),
    importPreview: (rivalId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<ImportPreviewResult>(`/rivals/${rivalId}/players/import-preview`, { method: 'POST', body: form });
    },
    importConfirm: (rivalId: string, rows: ImportedPlayerRow[]) =>
      request<Player[]>(`/rivals/${rivalId}/players/import`, { method: 'POST', body: JSON.stringify({ rows }) }),
  },
  matches: {
    list: (rivalId: string) => request<Match[]>(`/rivals/${rivalId}/matches`),
    get: (id: string) => request<Match>(`/matches/${id}`),
    create: (rivalId: string, data: Partial<Match>) =>
      request<Match>(`/rivals/${rivalId}/matches`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Match>) =>
      request<Match>(`/matches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/matches/${id}`, { method: 'DELETE' }),
    uploadCsv: (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<MatchCsv>(`/matches/${id}/csv`, { method: 'POST', body: form });
    },
    removeCsv: (id: string) => request<void>(`/matches/${id}/csv`, { method: 'DELETE' }),
    resolveRivalSituacion: (id: string, rowIndex: number, situacion: string) =>
      request<MatchCsv>(`/matches/${id}/csv/rival-resolucion`, {
        method: 'PUT',
        body: JSON.stringify({ rowIndex, situacion }),
      }),
  },
};
