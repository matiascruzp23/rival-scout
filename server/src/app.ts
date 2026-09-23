import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { supabase, newId } from './supabaseClient.js';
import { requireAuth } from './auth.js';
import { parseCsv, isExcludedCategory } from './csv.js';
import { parsePlayerImportFile, type ImportedPlayerRow } from './playerImport.js';
import { parseLeagueStatsFile } from './leagueStats.js';
import type {
  Player,
  Match,
  Rival,
  TorneoRegla,
  LineupEntry,
  Substitution,
  MatchEvent,
  MatchBaja,
  MatchCsv,
  LeagueStatsImport,
  IndividualStatsImport,
} from './types.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const ESCUDO_BUCKET = 'escudos';
const ESCUDO_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const escudoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ESCUDO_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Formato de imagen no admitido (usa PNG, JPG, WEBP o GIF)'));
  },
});

const now = () => new Date().toISOString();

// ---------- Mapeo entre filas de Supabase (snake_case) y el contrato JSON
// existente de la API (camelCase, igual al que ya consume el cliente). ----

function toPlayer(row: any): Player {
  return {
    id: row.id,
    rivalId: row.rival_id,
    nombre: row.nombre,
    dorsal: row.dorsal,
    posicion: row.posicion || '',
    posicionAlternativa: row.posicion_alternativa || undefined,
    estatura: row.estatura,
    pie: row.pie,
    sub21: row.sub21,
    sub18: row.sub18,
    extranjero: row.extranjero,
    baja: row.baja,
    duda: row.duda,
    enSeleccion: row.en_seleccion,
    notas: row.notas || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function playerInsertRow(id: string, rivalId: string, b: Partial<Player>) {
  return {
    id,
    rival_id: rivalId,
    nombre: b.nombre!.trim(),
    dorsal: b.dorsal === null || b.dorsal === undefined || Number.isNaN(Number(b.dorsal)) ? null : Number(b.dorsal),
    posicion: b.posicion?.trim() || '',
    posicion_alternativa: b.posicionAlternativa?.trim() || null,
    estatura:
      b.estatura === null || b.estatura === undefined || Number.isNaN(Number(b.estatura)) ? null : Number(b.estatura),
    pie: b.pie || null,
    sub21: !!b.sub21,
    sub18: !!b.sub18,
    extranjero: !!b.extranjero,
    baja: !!b.baja,
    duda: !!b.duda,
    en_seleccion: !!b.enSeleccion,
    notas: b.notas || '',
    created_at: now(),
    updated_at: now(),
  };
}

function toTorneoRegla(row: any): TorneoRegla {
  return {
    id: row.id,
    torneo: row.torneo,
    maxExtranjeros: row.max_extranjeros,
    minSub21: row.min_sub21,
    exencionPorSeleccionado: row.exencion_por_seleccionado,
  };
}

function toRival(row: any, reglasTorneo: TorneoRegla[]): Rival {
  return {
    id: row.id,
    nombre: row.nombre,
    proximoPartido: {
      competicion: row.proximo_partido_competicion || '',
      instancia: row.proximo_partido_instancia || '',
      fecha: row.proximo_partido_fecha || '',
      estadio: row.proximo_partido_estadio || '',
      condicion: (row.proximo_partido_condicion as 'Local' | 'Visitante' | '') || '',
    },
    sistemaPrincipal: row.sistema_principal || undefined,
    sistemaAlternativo: row.sistema_alternativo || undefined,
    entrenador: row.entrenador || undefined,
    entrenadorGanados: row.entrenador_ganados ?? undefined,
    entrenadorEmpatados: row.entrenador_empatados ?? undefined,
    entrenadorPerdidos: row.entrenador_perdidos ?? undefined,
    notasContexto: row.notas_contexto || undefined,
    notaXI: row.nota_xi || undefined,
    reglasTorneo,
    escudoUrl: row.escudo_url || undefined,
    codigoLdp: row.codigo_ldp || undefined,
    graficoPersonalizado: row.grafico_personalizado?.length ? row.grafico_personalizado : undefined,
    createdBy: row.created_by || undefined,
    visibleUserIds: row.visible_user_ids ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLeagueStatsImport(row: any): LeagueStatsImport {
  return {
    fileName: row.file_name || '',
    columns: row.columns || [],
    rows: row.rows || [],
    codigoPropio: row.codigo_propio || undefined,
    uploadedAt: row.uploaded_at,
  };
}

function toIndividualStatsImport(row: any): IndividualStatsImport {
  return {
    fileName: row.file_name || '',
    columns: row.columns || [],
    rows: row.rows || [],
    uploadedAt: row.uploaded_at,
  };
}

// null/undefined en visible_user_ids = público (visible para todos, el
// comportamiento de siempre); una lista (incluso vacía) restringe el rival
// a su creador más quien esté en esa lista — ver Rival.visibleUserIds.
function puedeVerRival(row: { created_by?: string | null; visible_user_ids?: string[] | null }, userId: string): boolean {
  if (row.visible_user_ids == null) return true;
  if (row.created_by === userId) return true;
  return row.visible_user_ids.includes(userId);
}

async function getReglas(rivalId: string): Promise<TorneoRegla[]> {
  const { data } = await supabase.from('torneo_reglas').select('*').eq('rival_id', rivalId);
  return (data || []).map(toTorneoRegla);
}

function toLineupEntry(row: any): LineupEntry {
  return { playerId: row.player_id, posicion: row.posicion, x: row.x ?? undefined, y: row.y ?? undefined };
}

function toSubstitution(row: any): Substitution {
  return {
    id: row.id,
    minuto: row.minuto,
    jugadorSaleId: row.jugador_sale_id,
    jugadorEntraId: row.jugador_entra_id,
    posicionSale: row.posicion_sale,
    posicionEntra: row.posicion_entra,
    descripcion: row.descripcion || undefined,
    sistemaResultante: row.sistema_resultante || undefined,
    layoutResultante: row.layout_resultante || undefined,
  };
}

function toMatchEvent(row: any): MatchEvent {
  return {
    id: row.id,
    minuto: row.minuto,
    tipo: row.tipo,
    jugadorId: row.jugador_id || undefined,
    descripcion: row.descripcion || undefined,
  };
}

function toMatchBaja(row: any): MatchBaja {
  return { id: row.id, jugadorId: row.jugador_id, tipo: row.tipo, motivo: row.motivo || undefined };
}

function toMatchCsv(row: any): MatchCsv {
  return {
    fileName: row.file_name,
    columns: row.columns || [],
    rows: row.rows || [],
    importedAt: row.imported_at,
    excludedCategories: row.excluded_categories || [],
  };
}

interface MatchChildren {
  lineup: LineupEntry[];
  substitutions: Substitution[];
  events: MatchEvent[];
  banca: string[];
  bajas: MatchBaja[];
  csv: MatchCsv | null;
}

function toMatch(row: any, children: MatchChildren): Match {
  return {
    id: row.id,
    rivalId: row.rival_id,
    fecha: row.fecha,
    oponente: row.oponente || '',
    condicion: row.condicion === 'Visitante' ? 'Visitante' : 'Local',
    golesFavor: row.goles_favor,
    golesContra: row.goles_contra,
    sistema: row.sistema || '',
    sistemaOponente: row.sistema_oponente || '',
    duracionMinutos: row.duracion_minutos,
    competencia: row.competencia || '',
    jornada: row.jornada || '',
    lineup: children.lineup,
    substitutions: children.substitutions,
    events: children.events,
    banca: children.banca,
    bajas: children.bajas,
    csv: children.csv,
    notas: row.notas || '',
    notaTactica: row.nota_tactica || '',
    enVivo: !!row.en_vivo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Arma varios partidos completos (con sus colecciones hijas) en un lote de
// consultas por tabla (no una por partido), agrupando en JS por match_id.
async function loadMatchesFull(matchRows: any[]): Promise<Match[]> {
  if (matchRows.length === 0) return [];
  const ids = matchRows.map((m) => m.id);
  const [lineupRes, subsRes, eventsRes, bancaRes, bajasRes, csvRes] = await Promise.all([
    supabase.from('lineup_entries').select('*').in('match_id', ids),
    supabase.from('substitutions').select('*').in('match_id', ids),
    supabase.from('match_events').select('*').in('match_id', ids),
    supabase.from('match_banca').select('*').in('match_id', ids),
    supabase.from('match_bajas').select('*').in('match_id', ids),
    supabase.from('match_csv').select('*').in('match_id', ids),
  ]);

  const groupBy = (rows: any[] | null) => {
    const map = new Map<string, any[]>();
    for (const r of rows || []) {
      if (!map.has(r.match_id)) map.set(r.match_id, []);
      map.get(r.match_id)!.push(r);
    }
    return map;
  };
  const lineupByMatch = groupBy(lineupRes.data);
  const subsByMatch = groupBy(subsRes.data);
  const eventsByMatch = groupBy(eventsRes.data);
  const bancaByMatch = groupBy(bancaRes.data);
  const bajasByMatch = groupBy(bajasRes.data);
  const csvByMatch = new Map<string, any>();
  for (const r of csvRes.data || []) csvByMatch.set(r.match_id, r);

  return matchRows.map((row) =>
    toMatch(row, {
      lineup: (lineupByMatch.get(row.id) || []).map(toLineupEntry),
      substitutions: (subsByMatch.get(row.id) || []).map(toSubstitution),
      events: (eventsByMatch.get(row.id) || []).map(toMatchEvent),
      banca: (bancaByMatch.get(row.id) || []).map((r) => r.player_id),
      bajas: (bajasByMatch.get(row.id) || []).map(toMatchBaja),
      csv: csvByMatch.has(row.id) ? toMatchCsv(csvByMatch.get(row.id)) : null,
    })
  );
}

async function getMatchFull(matchId: string): Promise<Match | null> {
  const { data: row } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle();
  if (!row) return null;
  const [full] = await loadMatchesFull([row]);
  return full;
}

// Reemplaza por completo cada colección hija de un partido que venga
// presente en el body (borra e inserta de nuevo) — misma semántica de
// "reemplazo completo" que el archivo JSON tenía con estos mismos campos.
async function replaceChildren(matchId: string, b: Partial<Match>) {
  if (b.lineup !== undefined) {
    await supabase.from('lineup_entries').delete().eq('match_id', matchId);
    if (b.lineup.length > 0) {
      await supabase.from('lineup_entries').insert(
        b.lineup.map((l) => ({ match_id: matchId, player_id: l.playerId, posicion: l.posicion, x: l.x ?? null, y: l.y ?? null }))
      );
    }
  }
  if (b.substitutions !== undefined) {
    await supabase.from('substitutions').delete().eq('match_id', matchId);
    if (b.substitutions.length > 0) {
      await supabase.from('substitutions').insert(
        b.substitutions.map((s) => ({
          id: s.id || newId(),
          match_id: matchId,
          minuto: s.minuto,
          jugador_sale_id: s.jugadorSaleId,
          jugador_entra_id: s.jugadorEntraId,
          posicion_sale: s.posicionSale,
          posicion_entra: s.posicionEntra,
          descripcion: s.descripcion || null,
          sistema_resultante: s.sistemaResultante || null,
          layout_resultante: s.layoutResultante || null,
        }))
      );
    }
  }
  if (b.events !== undefined) {
    await supabase.from('match_events').delete().eq('match_id', matchId);
    if (b.events.length > 0) {
      await supabase.from('match_events').insert(
        b.events.map((e) => ({
          id: e.id || newId(),
          match_id: matchId,
          minuto: e.minuto,
          tipo: e.tipo,
          jugador_id: e.jugadorId || null,
          descripcion: e.descripcion || null,
        }))
      );
    }
  }
  if (b.banca !== undefined) {
    await supabase.from('match_banca').delete().eq('match_id', matchId);
    if (b.banca.length > 0) {
      await supabase.from('match_banca').insert(b.banca.map((playerId) => ({ match_id: matchId, player_id: playerId })));
    }
  }
  if (b.bajas !== undefined) {
    await supabase.from('match_bajas').delete().eq('match_id', matchId);
    if (b.bajas.length > 0) {
      await supabase.from('match_bajas').insert(
        b.bajas.map((baja) => ({
          id: baja.id || newId(),
          match_id: matchId,
          jugador_id: baja.jugadorId,
          tipo: baja.tipo,
          motivo: baja.motivo || null,
        }))
      );
    }
  }
}

async function removeExistingEscudo(rivalId: string) {
  const { data: files } = await supabase.storage.from(ESCUDO_BUCKET).list('', { limit: 1000 });
  const matching = (files || []).filter((f) => f.name.startsWith(`${rivalId}-`));
  if (matching.length > 0) {
    await supabase.storage.from(ESCUDO_BUCKET).remove(matching.map((f) => f.name));
  }
}

// ---------- Rivals ----------

app.get('/api/rivals', async (req, res) => {
  const [{ data: rivalRows, error }, { data: playerRows }, { data: matchRows }] = await Promise.all([
    supabase.from('rivals').select('*').order('created_at'),
    supabase.from('players').select('rival_id'),
    supabase.from('matches').select('rival_id'),
  ]);
  if (error) return res.status(500).json({ error: error.message });

  const countBy = (rows: { rival_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows || []) map.set(r.rival_id, (map.get(r.rival_id) || 0) + 1);
    return map;
  };
  const playerCounts = countBy(playerRows);
  const matchCounts = countBy(matchRows);

  const list = (rivalRows || [])
    .filter((r) => puedeVerRival(r, req.user!.id))
    .map((r) => ({
      ...toRival(r, []),
      matchCount: matchCounts.get(r.id) || 0,
      playerCount: playerCounts.get(r.id) || 0,
    }));
  res.json(list);
});

app.post('/api/rivals', async (req, res) => {
  const { nombre, sistemaPrincipal, sistemaAlternativo, entrenador, visibleUserIds } = req.body as {
    nombre?: string;
    sistemaPrincipal?: string;
    sistemaAlternativo?: string;
    entrenador?: string;
    visibleUserIds?: string[];
  };
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' });
  const row = {
    id: newId(),
    nombre: nombre.trim(),
    sistema_principal: sistemaPrincipal || null,
    sistema_alternativo: sistemaAlternativo || null,
    entrenador: entrenador?.trim() || null,
    created_by: req.user!.id,
    visible_user_ids: visibleUserIds !== undefined ? visibleUserIds : null,
    created_at: now(),
    updated_at: now(),
  };
  const { data, error } = await supabase.from('rivals').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(toRival(data, []));
});

app.get('/api/rivals/:id', async (req, res) => {
  const { data: rivalRow, error } = await supabase.from('rivals').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!rivalRow || !puedeVerRival(rivalRow, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });

  const [reglas, { data: playerRows }, { data: matchRows }, { data: individualStatsRow }] = await Promise.all([
    getReglas(rivalRow.id),
    supabase.from('players').select('*').eq('rival_id', rivalRow.id).order('created_at'),
    supabase.from('matches').select('*').eq('rival_id', rivalRow.id).order('fecha', { ascending: false }),
    supabase.from('individual_stats_import').select('*').eq('rival_id', rivalRow.id).maybeSingle(),
  ]);
  const matches = await loadMatchesFull(matchRows || []);
  res.json({
    ...toRival(rivalRow, reglas),
    players: (playerRows || []).map(toPlayer),
    matches,
    individualStats: individualStatsRow ? toIndividualStatsImport(individualStatsRow) : null,
  });
});

app.put('/api/rivals/:id', async (req, res) => {
  const { data: existing } = await supabase
    .from('rivals')
    .select('id, created_by, visible_user_ids')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing || !puedeVerRival(existing, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });
  const b = req.body as Partial<Rival>;

  const patch: Record<string, unknown> = { updated_at: now() };
  if (b.nombre && b.nombre.trim()) patch.nombre = b.nombre.trim();
  if (b.proximoPartido !== undefined) {
    const p = b.proximoPartido;
    patch.proximo_partido_competicion = p?.competicion || null;
    patch.proximo_partido_instancia = p?.instancia || null;
    patch.proximo_partido_fecha = p?.fecha || null;
    patch.proximo_partido_estadio = p?.estadio || null;
    patch.proximo_partido_condicion = p?.condicion || null;
  }
  if (b.sistemaPrincipal !== undefined) patch.sistema_principal = b.sistemaPrincipal || null;
  if (b.sistemaAlternativo !== undefined) patch.sistema_alternativo = b.sistemaAlternativo || null;
  if (b.entrenador !== undefined) patch.entrenador = b.entrenador?.trim() || null;
  if (b.entrenadorGanados !== undefined) patch.entrenador_ganados = b.entrenadorGanados;
  if (b.entrenadorEmpatados !== undefined) patch.entrenador_empatados = b.entrenadorEmpatados;
  if (b.entrenadorPerdidos !== undefined) patch.entrenador_perdidos = b.entrenadorPerdidos;
  if (b.notasContexto !== undefined) patch.notas_contexto = b.notasContexto || null;
  if (b.notaXI !== undefined) patch.nota_xi = b.notaXI || null;
  if (b.codigoLdp !== undefined) patch.codigo_ldp = b.codigoLdp?.trim() || null;
  if (b.graficoPersonalizado !== undefined) patch.grafico_personalizado = b.graficoPersonalizado?.length ? b.graficoPersonalizado : null;
  // Array vacío ([]) es un valor válido distinto de "sin restringir": deja
  // el rival visible solo para su creador. Solo `null` lo vuelve a hacer
  // público — ver puedeVerRival.
  if (b.visibleUserIds !== undefined) patch.visible_user_ids = b.visibleUserIds;

  const { data: updated, error } = await supabase.from('rivals').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  if (b.reglasTorneo !== undefined) {
    await supabase.from('torneo_reglas').delete().eq('rival_id', req.params.id);
    if (b.reglasTorneo.length > 0) {
      await supabase.from('torneo_reglas').insert(
        b.reglasTorneo.map((r) => ({
          id: r.id || newId(),
          rival_id: req.params.id,
          torneo: r.torneo,
          max_extranjeros: r.maxExtranjeros ?? null,
          min_sub21: r.minSub21 ?? null,
          exencion_por_seleccionado: r.exencionPorSeleccionado ?? null,
        }))
      );
    }
  }

  const reglas = await getReglas(req.params.id);
  res.json(toRival(updated, reglas));
});

app.post('/api/rivals/:id/escudo', escudoUpload.single('file'), async (req, res) => {
  const { data: rivalRow } = await supabase
    .from('rivals')
    .select('id, created_by, visible_user_ids')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!rivalRow || !puedeVerRival(rivalRow, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });

  const ext = ESCUDO_MIME_EXT[req.file.mimetype];
  await removeExistingEscudo(rivalRow.id);
  const filename = `${rivalRow.id}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(ESCUDO_BUCKET)
    .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: pub } = supabase.storage.from(ESCUDO_BUCKET).getPublicUrl(filename);
  const { data: updated, error } = await supabase
    .from('rivals')
    .update({ escudo_url: pub.publicUrl, updated_at: now() })
    .eq('id', rivalRow.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  const reglas = await getReglas(rivalRow.id);
  res.json(toRival(updated, reglas));
});

app.delete('/api/rivals/:id/escudo', async (req, res) => {
  const { data: rivalRow } = await supabase
    .from('rivals')
    .select('id, created_by, visible_user_ids')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!rivalRow || !puedeVerRival(rivalRow, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });
  await removeExistingEscudo(rivalRow.id);
  const { data: updated, error } = await supabase
    .from('rivals')
    .update({ escudo_url: null, updated_at: now() })
    .eq('id', rivalRow.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  const reglas = await getReglas(rivalRow.id);
  res.json(toRival(updated, reglas));
});

app.delete('/api/rivals/:id', async (req, res) => {
  const { data: existing } = await supabase
    .from('rivals')
    .select('id, created_by, visible_user_ids')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing || !puedeVerRival(existing, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });
  await removeExistingEscudo(req.params.id);
  const { error } = await supabase.from('rivals').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

// ---------- Usuarios (para el selector de "compartido con") ----------

app.get('/api/users', async (_req, res) => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) return res.status(500).json({ error: error.message });
  const users = data.users
    .map((u) => ({ id: u.id, username: (u.email || '').split('@')[0] }))
    .sort((a, b) => a.username.localeCompare(b.username));
  res.json(users);
});

// ---------- Estadísticas individuales (por rival) ----------

app.post('/api/rivals/:id/individual-stats/import', upload.single('file'), async (req, res) => {
  const { data: rivalRow } = await supabase
    .from('rivals')
    .select('id, created_by, visible_user_ids')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!rivalRow || !puedeVerRival(rivalRow, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  let parsed;
  try {
    parsed = parseLeagueStatsFile(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'No se pudo leer el archivo (¿es un .xlsx válido?)' });
  }

  const row = {
    rival_id: req.params.id,
    file_name: req.file.originalname,
    columns: parsed.columns,
    rows: parsed.rows,
    uploaded_at: now(),
  };
  const { data, error } = await supabase.from('individual_stats_import').upsert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toIndividualStatsImport(data));
});

app.delete('/api/rivals/:id/individual-stats', async (req, res) => {
  const { data: rivalRow } = await supabase
    .from('rivals')
    .select('id, created_by, visible_user_ids')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!rivalRow || !puedeVerRival(rivalRow, req.user!.id)) return res.status(404).json({ error: 'Rival no encontrado' });
  const { error } = await supabase.from('individual_stats_import').delete().eq('rival_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

// ---------- Players ----------

app.get('/api/rivals/:rivalId/players', async (req, res) => {
  const { data, error } = await supabase.from('players').select('*').eq('rival_id', req.params.rivalId).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(toPlayer));
});

app.post('/api/rivals/:rivalId/players', async (req, res) => {
  const { data: rival } = await supabase.from('rivals').select('id').eq('id', req.params.rivalId).maybeSingle();
  if (!rival) return res.status(404).json({ error: 'Rival no encontrado' });
  const b = req.body as Partial<Player>;
  if (!b.nombre || !b.nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' });
  const row = playerInsertRow(newId(), rival.id, b);
  const { data, error } = await supabase.from('players').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(toPlayer(data));
});

// Sube una planilla (Wyscout u otra, .xlsx/.xls/.csv) y devuelve las filas
// ya convertidas a nuestro formato, sin crear nada todavía — el analista
// las revisa/corrige en el cliente antes de confirmar la importación.
app.post('/api/rivals/:rivalId/players/import-preview', upload.single('file'), async (req, res) => {
  const { data: rival } = await supabase.from('rivals').select('id').eq('id', req.params.rivalId).maybeSingle();
  if (!rival) return res.status(404).json({ error: 'Rival no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
  try {
    const result = parsePlayerImportFile(req.file.buffer);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo leer el archivo (¿es un .xlsx/.xls/.csv válido?)' });
  }
});

// Crea de una vez todos los jugadores ya revisados/corregidos en el
// cliente (mismo formato que ImportedPlayerRow, sin las columnas de solo
// referencia como posicionOriginal/posicionNecesitaRevision).
app.post('/api/rivals/:rivalId/players/import', async (req, res) => {
  const { data: rival } = await supabase.from('rivals').select('id').eq('id', req.params.rivalId).maybeSingle();
  if (!rival) return res.status(404).json({ error: 'Rival no encontrado' });
  const rows = req.body.rows as Partial<ImportedPlayerRow>[];
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No hay jugadores para importar' });

  const toInsert = rows
    .filter((r) => r.nombre && r.nombre.trim())
    .map((r) =>
      playerInsertRow(newId(), rival.id, {
        nombre: r.nombre,
        dorsal: r.dorsal ?? null,
        posicion: r.posicion || '',
        estatura: r.estatura ?? null,
        pie: r.pie ?? null,
        sub21: !!r.sub21,
        sub18: !!r.sub18,
        extranjero: !!r.extranjero,
      })
    );
  if (toInsert.length === 0) return res.status(400).json({ error: 'No hay jugadores para importar' });

  const { data, error } = await supabase.from('players').insert(toInsert).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json((data || []).map(toPlayer));
});

app.put('/api/players/:id', async (req, res) => {
  const { data: existing } = await supabase.from('players').select('id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Jugador no encontrado' });
  const b = req.body as Partial<Player>;

  const patch: Record<string, unknown> = { updated_at: now() };
  if (b.nombre !== undefined) patch.nombre = b.nombre.trim();
  if (b.dorsal !== undefined) patch.dorsal = b.dorsal === null || Number.isNaN(Number(b.dorsal)) ? null : Number(b.dorsal);
  if (b.posicion !== undefined) patch.posicion = b.posicion.trim();
  if (b.posicionAlternativa !== undefined) patch.posicion_alternativa = b.posicionAlternativa?.trim() || null;
  if (b.estatura !== undefined)
    patch.estatura = b.estatura === null || Number.isNaN(Number(b.estatura)) ? null : Number(b.estatura);
  if (b.pie !== undefined) patch.pie = b.pie;
  if (b.sub21 !== undefined) patch.sub21 = !!b.sub21;
  if (b.sub18 !== undefined) patch.sub18 = !!b.sub18;
  if (b.extranjero !== undefined) patch.extranjero = !!b.extranjero;
  if (b.baja !== undefined) patch.baja = !!b.baja;
  if (b.duda !== undefined) patch.duda = !!b.duda;
  if (b.enSeleccion !== undefined) patch.en_seleccion = !!b.enSeleccion;
  if (b.notas !== undefined) patch.notas = b.notas;

  const { data, error } = await supabase.from('players').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toPlayer(data));
});

app.delete('/api/players/:id', async (req, res) => {
  const { data: existing } = await supabase.from('players').select('id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Jugador no encontrado' });
  const { error } = await supabase.from('players').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

// ---------- Matches ----------

app.get('/api/rivals/:rivalId/matches', async (req, res) => {
  const { data: rows, error } = await supabase
    .from('matches')
    .select('*')
    .eq('rival_id', req.params.rivalId)
    .order('fecha', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(await loadMatchesFull(rows || []));
});

app.post('/api/rivals/:rivalId/matches', async (req, res) => {
  const { data: rival } = await supabase.from('rivals').select('id').eq('id', req.params.rivalId).maybeSingle();
  if (!rival) return res.status(404).json({ error: 'Rival no encontrado' });
  const b = req.body as Partial<Match>;
  const id = newId();
  const row = {
    id,
    rival_id: rival.id,
    fecha: b.fecha || now().slice(0, 10),
    oponente: b.oponente?.trim() || '',
    condicion: b.condicion === 'Visitante' ? 'Visitante' : 'Local',
    goles_favor: b.golesFavor ?? null,
    goles_contra: b.golesContra ?? null,
    sistema: b.sistema?.trim() || '',
    sistema_oponente: b.sistemaOponente?.trim() || '',
    duracion_minutos: b.duracionMinutos && b.duracionMinutos > 0 ? b.duracionMinutos : 90,
    competencia: b.competencia?.trim() || '',
    jornada: b.jornada?.trim() || '',
    notas: b.notas || '',
    nota_tactica: b.notaTactica || '',
    en_vivo: !!b.enVivo,
    created_at: now(),
    updated_at: now(),
  };
  const { error: insertError } = await supabase.from('matches').insert(row);
  if (insertError) return res.status(500).json({ error: insertError.message });

  await replaceChildren(id, {
    lineup: b.lineup || [],
    substitutions: b.substitutions || [],
    events: b.events || [],
    banca: b.banca || [],
    bajas: b.bajas || [],
  });

  res.status(201).json(await getMatchFull(id));
});

app.get('/api/matches/:id', async (req, res) => {
  const full = await getMatchFull(req.params.id);
  if (!full) return res.status(404).json({ error: 'Partido no encontrado' });
  res.json(full);
});

app.put('/api/matches/:id', async (req, res) => {
  const { data: existing } = await supabase.from('matches').select('id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Partido no encontrado' });
  const b = req.body as Partial<Match>;

  const patch: Record<string, unknown> = { updated_at: now() };
  if (b.fecha !== undefined) patch.fecha = b.fecha;
  if (b.oponente !== undefined) patch.oponente = b.oponente.trim();
  if (b.condicion !== undefined) patch.condicion = b.condicion;
  if (b.golesFavor !== undefined) patch.goles_favor = b.golesFavor;
  if (b.golesContra !== undefined) patch.goles_contra = b.golesContra;
  if (b.sistema !== undefined) patch.sistema = b.sistema.trim();
  if (b.sistemaOponente !== undefined) patch.sistema_oponente = b.sistemaOponente.trim();
  if (b.duracionMinutos !== undefined && b.duracionMinutos > 0) patch.duracion_minutos = b.duracionMinutos;
  if (b.competencia !== undefined) patch.competencia = b.competencia.trim();
  if (b.jornada !== undefined) patch.jornada = b.jornada.trim();
  if (b.notas !== undefined) patch.notas = b.notas;
  if (b.notaTactica !== undefined) patch.nota_tactica = b.notaTactica;
  if (b.enVivo !== undefined) patch.en_vivo = b.enVivo;

  const { error } = await supabase.from('matches').update(patch).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  await replaceChildren(req.params.id, b);
  res.json(await getMatchFull(req.params.id));
});

app.delete('/api/matches/:id', async (req, res) => {
  const { data: existing } = await supabase.from('matches').select('id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Partido no encontrado' });
  const { error } = await supabase.from('matches').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

app.post('/api/matches/:id/csv', upload.single('file'), async (req, res) => {
  const { data: matchRow } = await supabase.from('matches').select('id').eq('id', req.params.id).maybeSingle();
  if (!matchRow) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Archivo CSV requerido' });

  const text = req.file.buffer.toString('utf-8');
  const { columns, rows } = parseCsv(text);
  if (columns.length === 0) return res.status(400).json({ error: 'El CSV está vacío o no se pudo leer' });

  const categoryColumn = columns.find((c) => c.trim().toLowerCase() === 'row');
  const excludedCategories = new Set<string>();
  let filteredRows = rows;
  if (categoryColumn) {
    filteredRows = rows.filter((r) => {
      const excluded = isExcludedCategory(r[categoryColumn]);
      if (excluded) excludedCategories.add(r[categoryColumn]);
      return !excluded;
    });
  }

  const csvRow = {
    match_id: matchRow.id,
    file_name: req.file.originalname,
    columns,
    rows: filteredRows,
    imported_at: now(),
    excluded_categories: Array.from(excludedCategories),
  };
  const { data: saved, error } = await supabase.from('match_csv').upsert(csvRow).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('matches').update({ updated_at: now() }).eq('id', matchRow.id);
  res.json(toMatchCsv(saved));
});

app.delete('/api/matches/:id/csv', async (req, res) => {
  const { data: matchRow } = await supabase.from('matches').select('id').eq('id', req.params.id).maybeSingle();
  if (!matchRow) return res.status(404).json({ error: 'Partido no encontrado' });
  await supabase.from('match_csv').delete().eq('match_id', matchRow.id);
  await supabase.from('matches').update({ updated_at: now() }).eq('id', matchRow.id);
  res.status(204).end();
});

// Registra a qué situación concreta corresponde el rival marcado en una
// fila ambigua del CSV (2+ situaciones a la vez junto con la columna
// "Rivales" rellenada — ver client/src/lib/csvAnalysis.ts). Se guarda
// dentro de la propia fila, sin tocar ninguna otra columna ni necesitar una
// tabla aparte. Acepta una sola `situacion` (aplica a todos los rivales de
// la fila por igual) o `porJugador` (mapeo 1 a 1 rival -> situación, para
// el caso de 2 rivales + 2 situaciones donde cada uno hizo una distinta).
app.put('/api/matches/:id/csv/rival-resolucion', async (req, res) => {
  const { data: matchRow } = await supabase.from('matches').select('id').eq('id', req.params.id).maybeSingle();
  if (!matchRow) return res.status(404).json({ error: 'Partido no encontrado' });
  const { rowIndex, situacion, porJugador } = req.body as {
    rowIndex?: number;
    situacion?: string;
    porJugador?: Record<string, string>;
  };
  if (typeof rowIndex !== 'number' || (!situacion && !porJugador)) {
    return res.status(400).json({ error: 'rowIndex y (situacion o porJugador) son requeridos' });
  }

  const { data: csvRow } = await supabase.from('match_csv').select('rows').eq('match_id', matchRow.id).maybeSingle();
  if (!csvRow) return res.status(404).json({ error: 'Este partido no tiene CSV cargado' });
  const rows = (csvRow.rows || []) as Record<string, string>[];
  if (!rows[rowIndex]) return res.status(400).json({ error: 'Fila fuera de rango' });

  rows[rowIndex] = porJugador
    ? { ...rows[rowIndex], __rivalResueltoPorJugador: JSON.stringify(porJugador) }
    : { ...rows[rowIndex], __rivalResuelto: situacion as string };
  const { data: saved, error } = await supabase
    .from('match_csv')
    .update({ rows })
    .eq('match_id', matchRow.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toMatchCsv(saved));
});

// Planilla de estadísticas de toda la liga (Gráficos y estadísticas): un
// único registro compartido entre todos los rivales, no una tabla por
// rival — cada import reemplaza entero al anterior.
const LEAGUE_STATS_ID = 'current';

app.get('/api/league-stats', async (_req, res) => {
  const { data, error } = await supabase.from('league_stats_import').select('*').eq('id', LEAGUE_STATS_ID).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json(null);
  res.json(toLeagueStatsImport(data));
});

app.post('/api/league-stats/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo Excel requerido' });

  let parsed;
  try {
    parsed = parseLeagueStatsFile(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'No se pudo leer el archivo (¿es un .xlsx válido?)' });
  }
  if (parsed.columns.length === 0) return res.status(400).json({ error: 'La planilla está vacía o no se pudo leer' });

  // El código propio ya cargado se mantiene si no se manda uno nuevo en
  // este import (no siempre se resube junto con el archivo).
  const { data: existing } = await supabase
    .from('league_stats_import')
    .select('codigo_propio')
    .eq('id', LEAGUE_STATS_ID)
    .maybeSingle();
  const codigoPropio = (req.body as { codigoPropio?: string }).codigoPropio?.trim() || existing?.codigo_propio || null;

  const row = {
    id: LEAGUE_STATS_ID,
    file_name: req.file.originalname,
    columns: parsed.columns,
    rows: parsed.rows,
    codigo_propio: codigoPropio,
    uploaded_at: now(),
  };
  const { data: saved, error } = await supabase.from('league_stats_import').upsert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toLeagueStatsImport(saved));
});

app.put('/api/league-stats/config', async (req, res) => {
  const { codigoPropio } = req.body as { codigoPropio?: string };
  const { data: existing } = await supabase.from('league_stats_import').select('id').eq('id', LEAGUE_STATS_ID).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Todavía no se importó ninguna planilla' });
  const { data: saved, error } = await supabase
    .from('league_stats_import')
    .update({ codigo_propio: codigoPropio?.trim() || null })
    .eq('id', LEAGUE_STATS_ID)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(toLeagueStatsImport(saved));
});

// Middleware de error genérico: sin esto, un archivo rechazado por
// escudoUpload (u otro error de multer) llega al manejador por defecto de
// Express, que responde con una página HTML y expone la traza del error.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
});

// Sin app.listen() aquí: este módulo solo define la app. El servidor local
// (server/src/index.ts) la levanta con app.listen(); en Vercel, server/api/
// la usa directamente como función serverless (ver server/api/[...path].ts).
export default app;
