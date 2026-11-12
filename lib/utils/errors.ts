const PATRON_ERROR_TECNICO =
  /pgrst|postgres|supabase|sql|schema|relation "|column "|constraint|violates |foreign key|duplicate key|jwt|token|indexeddb|dexie|failed to fetch|fetch failed|networkerror|timeout|econnrefused|enotfound/i;

/**
 * Extrae un mensaje legible de un error de tipo desconocido (bloques `catch`).
 * Oculta mensajes técnicos internos (base de datos, red o tokens) mostrando el texto amigable por defecto.
 */
export function obtenerMensajeError(err: unknown, porDefecto = 'Ocurrió un error inesperado.'): string {
  let mensaje = '';
  if (err instanceof Error && err.message) {
    mensaje = err.message;
  } else if (typeof err === 'string' && err) {
    mensaje = err;
  } else if (err && typeof err === 'object' && 'message' in err) {
    const raw = (err as { message?: unknown }).message;
    if (typeof raw === 'string' && raw) mensaje = raw;
  }

  if (!mensaje) return porDefecto;
  if (/failed to fetch|fetch failed|networkerror|enotfound|econnrefused/i.test(mensaje)) {
    return 'No se pudo conectar en este momento. Revisa tu internet e intenta de nuevo.';
  }
  if (PATRON_ERROR_TECNICO.test(mensaje)) {
    return porDefecto;
  }
  return mensaje;
}
