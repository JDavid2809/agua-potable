/**
 * Utilidades para consultar y sincronizar volúmenes de datos masivos en Supabase.
 * 
 * Por defecto, el servidor PostgREST de Supabase impone un tope de seguridad de
 * 1,000 registros por solicitud HTTP (PGRST_MAX_ROWS=1000). Si una tabla tiene
 * 1,500, 3,000 o 20,000 registros, cualquier .select('*') o .range(0, 4999) es
 * truncado a exactamente 1,000 filas.
 *
 * Estas funciones resuelven de raíz ese límite, realizando peticiones paginadas
 * automáticas por lotes (chunks) en rangos (0-999, 1000-1999...) hasta traer
 * el 100% de los datos reales de la base de datos sin truncamientos.
 */

export type QueryRangeFn<T> = (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: any }>;

/**
 * Consulta y concatena TODOS los registros de una consulta Supabase
 * iterando en bloques seguros (por defecto 500) hasta que la base de datos entregue el universo completo,
 * evitando cualquier límite de 1,000 filas de PostgREST.
 *
 * @param queryFn Función constructora que recibe (from, to) y devuelve la promesa de Supabase
 * @param chunkSize Tamaño de cada bloque HTTP (por defecto 500 para mantenerse por debajo del límite de PostgREST)
 */
export async function fetchAllRows<T = any>(
  queryFn: QueryRangeFn<T>,
  chunkSize = 500
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + chunkSize - 1;
    const { data, error } = await queryFn(from, to);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (let i = 0; i < data.length; i++) {
      allRows.push(data[i]);
    }

    // Si el bloque actual trajo menos que el tamaño solicitado, ya se alcanzaron todos los registros
    if (data.length < chunkSize) {
      break;
    }

    from += chunkSize;
  }

  return allRows;
}

/**
 * Inserta un arreglo de registros en una tabla de Supabase dividiéndolo en lotes
 * seguros (por defecto 150) para prevenir desbordamiento de payload HTTP o límites de PostgreSQL.
 */
export async function insertInBatches<T = any>(
  client: any,
  tableName: string,
  rows: T[],
  batchSize = 150
): Promise<void> {
  if (!rows || rows.length === 0) return;

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize);
    const { error } = await client.from(tableName).insert(chunk);
    if (error) {
      throw error;
    }
  }
}

