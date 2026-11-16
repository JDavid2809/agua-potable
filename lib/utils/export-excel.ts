import * as XLSX from 'xlsx';

export interface HojaExcel {
  nombre: string;
  filas: Record<string, unknown>[];
}

function ajustarAnchoColumnas(filas: Record<string, unknown>[]): XLSX.ColInfo[] {
  if (!filas || filas.length === 0) return [];
  const llaves = Object.keys(filas[0]);

  return llaves.map((key) => {
    let maxLen = key.length;
    for (const fila of filas) {
      const val = fila[key];
      const texto = val === null || val === undefined ? '' : String(val);
      if (texto.length > maxLen) {
        maxLen = texto.length;
      }
    }
    return { wch: Math.min(48, Math.max(12, maxLen + 3)) };
  });
}

/**
 * Exporta un arreglo de objetos a un archivo Excel (.xlsx) con ancho de columnas automático.
 */
export function exportarAExcel(
  filas: Record<string, unknown>[],
  nombreHoja: string,
  nombreArchivo: string
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = ajustarAnchoColumnas(filas);

  const hojaSegura = (nombreHoja || 'Datos').slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, hojaSegura);

  const archivoFinal = nombreArchivo.endsWith('.xlsx')
    ? nombreArchivo
    : `${nombreArchivo}.xlsx`;

  XLSX.writeFile(wb, archivoFinal);
}

/**
 * Exporta múltiples hojas dentro de un mismo archivo Excel (.xlsx).
 */
export function exportarMultiplesHojasAExcel(
  hojas: HojaExcel[],
  nombreArchivo: string
): void {
  const wb = XLSX.utils.book_new();

  for (const h of hojas) {
    const ws = XLSX.utils.json_to_sheet(h.filas);
    ws['!cols'] = ajustarAnchoColumnas(h.filas);
    const hojaSegura = (h.nombre || 'Hoja').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, hojaSegura);
  }

  const archivoFinal = nombreArchivo.endsWith('.xlsx')
    ? nombreArchivo
    : `${nombreArchivo}.xlsx`;

  XLSX.writeFile(wb, archivoFinal);
}

