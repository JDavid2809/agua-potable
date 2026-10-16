/**
 * Extrae un mensaje legible de un error de tipo desconocido (bloques `catch`).
 */
export function obtenerMensajeError(err: unknown, porDefecto = 'Ocurrió un error inesperado.'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const mensaje = (err as { message?: unknown }).message;
    if (typeof mensaje === 'string' && mensaje) return mensaje;
  }
  return porDefecto;
}
