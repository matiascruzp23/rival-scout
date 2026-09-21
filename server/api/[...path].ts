// Función serverless de Vercel: atrapa cualquier request bajo /api/* de
// este proyecto y se la pasa tal cual a la app de Express (que ya define
// sus rutas con el prefijo /api/... — ver server/src/app.ts), sin volver a
// enrutar nada acá. Express es en sí mismo un handler (req, res) => void,
// compatible directo con lo que espera el runtime de Node de Vercel.
import app from '../src/app.js';

export default app;
