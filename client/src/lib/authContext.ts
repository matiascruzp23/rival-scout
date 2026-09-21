import { createContext, useContext } from 'react';

// true cuando el usuario logueado tiene rol "viewer" (solo lectura — ver
// server/src/auth.ts, que es quien realmente hace cumplir esto: el servidor
// rechaza cualquier escritura suya sin importar lo que muestre la UI). Este
// contexto solo controla qué se muestra/habilita en pantalla.
export const IsViewerContext = createContext(false);

export function useIsViewer(): boolean {
  return useContext(IsViewerContext);
}
