// Función serverless de Vercel: atrapa cualquier request bajo /api/* de
// este mismo proyecto (client + API en un solo deploy, un solo dominio) y
// se la pasa tal cual a la app de Express (que ya define sus rutas con el
// prefijo /api/... — ver server/src/app.ts). Express es en sí mismo un
// handler (req, res) => void, compatible directo con lo que espera el
// runtime de Node de Vercel.
import app from '../server/src/app.js';

export default app;
