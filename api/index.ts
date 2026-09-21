// Función serverless de Vercel: recibe TODO lo que caiga bajo /api/* de
// este mismo proyecto (client + API en un solo deploy, un solo dominio) —
// el rewrite explícito en vercel.json enruta cada request acá, en vez de
// depender de la convención de nombre de archivo [...catchAll], que no se
// comportaba como atrapa-todo multi-segmento en este entorno. Se le pasa
// tal cual a la app de Express (que ya define sus rutas con el prefijo
// /api/... — ver server/src/app.ts). Express es en sí mismo un handler
// (req, res) => void, compatible directo con lo que espera el runtime de
// Node de Vercel.
import app from '../server/src/app.js';

export default app;
