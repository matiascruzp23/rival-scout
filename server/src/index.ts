import app from './app.js';

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
