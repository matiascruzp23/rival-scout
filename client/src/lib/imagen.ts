// Reduce una captura antes de subirla a Supabase Storage: a lo más 1920 px
// de ancho y en JPEG, que en un PDF A4 se ve igual pero pesa unos cientos
// de KB en vez de varios MB (un pantallazo PNG suele pesar 2–5 MB).
const MAX_ANCHO = 1920;
const CALIDAD = 0.85;

export async function comprimirCaptura(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_ANCHO / bitmap.width);
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // Fondo blanco: un PNG con transparencia quedaría negro al pasar a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD));
  if (!blob) return file;
  return new File([blob], 'captura.jpg', { type: 'image/jpeg' });
}
