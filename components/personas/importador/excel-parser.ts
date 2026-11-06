import * as XLSX from 'xlsx';
import type { TipoToma } from '@/types/database';
import type {
  CampoDestinoKey,
  ColumnaInfoExcel,
  FilaMatrizExcel,
  RegistroImportar,
} from './types';

export function normalizarTexto(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarTipoToma(valor: string): TipoToma {
  const norm = normalizarTexto(valor);
  if (norm.includes('comerc') || norm.includes('negoc') || norm.includes('tienda')) {
    return 'comercial';
  }
  if (
    norm.includes('comun') ||
    norm.includes('public') ||
    norm.includes('escuela') ||
    norm.includes('iglesia')
  ) {
    return 'comunal';
  }
  if (norm.includes('baldio') || norm.includes('lote') || norm.includes('terreno')) {
    return 'lote_baldio';
  }
  return 'domestica';
}

export function archivoTieneTituloValido(t: string): boolean {
  return Boolean(t && !t.startsWith('__EMPTY'));
}

/**
 * Extrae las celdas reales de la hoja de Excel sin deformar números
 * e inspecciona todas las claves para no truncar hojas con !ref limitado.
 */
export function extraerMatrizDeHoja(worksheet: XLSX.WorkSheet): {
  filas: FilaMatrizExcel[];
  letrasColumnas: string[];
} {
  let minRow = 0;
  let maxRow = 0;
  let minCol = 0;
  let maxCol = 0;
  let tieneRango = false;

  const ref = worksheet['!ref'];
  if (ref) {
    try {
      const dec = XLSX.utils.decode_range(ref);
      minRow = dec.s.r;
      maxRow = dec.e.r;
      minCol = dec.s.c;
      maxCol = dec.e.c;
      tieneRango = true;
    } catch {
      // Ignorar error de decodificación
    }
  }

  for (const key of Object.keys(worksheet)) {
    if (key.charCodeAt(0) === 33) continue;
    try {
      const cell = XLSX.utils.decode_cell(key);
      if (!tieneRango) {
        minRow = cell.r;
        maxRow = cell.r;
        minCol = cell.c;
        maxCol = cell.c;
        tieneRango = true;
      } else {
        if (cell.r < minRow) minRow = cell.r;
        if (cell.r > maxRow) maxRow = cell.r;
        if (cell.c < minCol) minCol = cell.c;
        if (cell.c > maxCol) maxCol = cell.c;
      }
    } catch {
      // Clave no celda
    }
  }

  if (!tieneRango) {
    return { filas: [], letrasColumnas: [] };
  }

  const columnasConDatos: number[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    let tieneAlgo = false;
    for (let r = minRow; r <= maxRow; r++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
        tieneAlgo = true;
        break;
      }
    }
    if (tieneAlgo) {
      columnasConDatos.push(c);
    }
  }

  if (columnasConDatos.length === 0) {
    return { filas: [], letrasColumnas: [] };
  }

  const letrasColumnas = columnasConDatos.map((c) => XLSX.utils.encode_col(c));
  const filas: FilaMatrizExcel[] = [];

  for (let r = minRow; r <= maxRow; r++) {
    let filaNoVacia = false;
    const celdas: string[] = columnasConDatos.map((c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      if (!cell || cell.v === undefined || cell.v === null) return '';

      let texto = '';
      if (cell.t === 'n') {
        const num = Number(cell.v);
        if (Number.isInteger(num)) {
          texto = String(num);
        } else {
          texto = String(Math.round(num * 100) / 100);
        }
      } else if (cell.t === 'b') {
        texto = cell.v ? 'Sí' : 'No';
      } else {
        texto = String(cell.v ?? cell.w ?? '').trim();
      }

      if (texto !== '') filaNoVacia = true;
      return texto;
    });

    if (filaNoVacia) {
      filas.push({
        numeroFilaExcel: r + 1,
        celdas,
      });
    }
  }

  return { filas, letrasColumnas };
}

/**
 * Detecta automáticamente cuál fila de la matriz es la fila de encabezados.
 */
export function detectarIndiceFilaEncabezado(filas: FilaMatrizExcel[]): number {
  if (filas.length === 0) return 0;

  const palabrasClaveEncabezado = [
    'nombre',
    'apellido',
    'paterno',
    'materno',
    'titular',
    'contribuyente',
    'ciudadano',
    'jefe',
    'usuario',
    'persona',
    'telefono',
    'celular',
    'tel',
    'cel',
    'whatsapp',
    'direccion',
    'domicilio',
    'calle',
    'ubicacion',
    'referencia',
    'toma',
    'tomas',
    'agua',
    'contrato',
    'barrio',
    'colonia',
    'sector',
    'localidad',
    'manzana',
    'mz',
    'cuadra',
    'seccion',
    'curp',
    'ine',
    'identificacion',
    'medidor',
    'saldo',
    'adeudo',
    'deuda',
    'nota',
    'observacion',
    'comentario',
    'folio',
  ];

  let mejorIndice = 0;
  let mejorPuntaje = -1;
  const limiteBusqueda = Math.min(filas.length, 20);

  for (let i = 0; i < limiteBusqueda; i++) {
    const celdas = filas[i].celdas;
    const noVacias = celdas.filter((c) => c.trim() !== '');
    if (noVacias.length <= 1 && filas.length > 1) {
      continue;
    }

    let puntaje = noVacias.length * 2;

    for (const celda of noVacias) {
      const norm = normalizarTexto(celda);
      if (/^\d+$/.test(celda.trim())) {
        puntaje -= 3;
        continue;
      }
      for (const kw of palabrasClaveEncabezado) {
        if (norm === kw || norm.split(' ').includes(kw) || norm.includes(kw)) {
          puntaje += 10;
          break;
        }
      }
    }

    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorIndice = i;
    }
  }

  return mejorIndice;
}

/**
 * Asigna automáticamente qué campo representa cada columna del Excel.
 */
export function autoAsignarColumnasInteligente(
  columnas: ColumnaInfoExcel[],
  tieneEncabezados: boolean
): Record<number, CampoDestinoKey> {
  const asignacion: Record<number, CampoDestinoKey> = {};
  columnas.forEach((c) => {
    asignacion[c.colIndex] = 'ignorar';
  });

  const usadas = new Set<number>();

  if (tieneEncabezados) {
    const buscarYAsignar = (
      patronesExactos: string[],
      patronesParciales: string[],
      destino: CampoDestinoKey,
      permitirMultiples = false
    ) => {
      for (const col of columnas) {
        if (usadas.has(col.colIndex)) continue;
        const norm = normalizarTexto(col.tituloEncabezado);
        if (!norm) continue;
        const palabras = norm.split(' ');

        const coincideExacto = patronesExactos.some(
          (p) => norm === p || palabras.includes(p)
        );
        if (coincideExacto) {
          asignacion[col.colIndex] = destino;
          usadas.add(col.colIndex);
          if (!permitirMultiples) return;
        }
      }

      const yaTieneAsignado = Object.values(asignacion).includes(destino);
      if (yaTieneAsignado && !permitirMultiples) return;

      for (const col of columnas) {
        if (usadas.has(col.colIndex)) continue;
        const norm = normalizarTexto(col.tituloEncabezado);
        if (!norm) continue;

        const coincideParcial = patronesParciales.some((p) => norm.includes(p));
        if (coincideParcial) {
          asignacion[col.colIndex] = destino;
          usadas.add(col.colIndex);
          if (!permitirMultiples) return;
        }
      }
    };

    for (const col of columnas) {
      const norm = normalizarTexto(col.tituloEncabezado);
      if (
        norm === 'no' ||
        norm === 'num' ||
        norm === 'numero' ||
        norm === 'id' ||
        norm === 'consecutivo' ||
        norm === '#'
      ) {
        usadas.add(col.colIndex);
      }
    }

    buscarYAsignar(
      ['codigo de toma', 'folio de toma', 'clave toma', 'contrato'],
      ['codigo toma', 'folio toma', 'no contrato'],
      'codigo_toma'
    );

    buscarYAsignar(
      ['tipo de toma', 'tipo toma', 'giro', 'categoria'],
      ['tipo toma', 'uso de toma'],
      'tipo_toma'
    );

    buscarYAsignar(
      [
        'cantidad de tomas',
        'numero de tomas',
        'no de tomas',
        'num de tomas',
        'total tomas',
        'cant tomas',
        'tomas',
      ],
      ['tomas', 'no tomas', 'num tomas', 'cant tomas'],
      'cantidad_tomas'
    );

    buscarYAsignar(
      [
        'nombre completo',
        'nombre del titular',
        'nombre',
        'nombres',
        'apellido',
        'apellidos',
        'paterno',
        'materno',
        'titular',
        'contribuyente',
        'ciudadano',
        'jefe de familia',
      ],
      ['nombre', 'apellido', 'titular', 'contribuyente', 'jefe de familia', 'ciudadano'],
      'nombre_completo',
      true
    );

    buscarYAsignar(
      ['telefono', 'celular', 'tel', 'cel', 'whatsapp', 'movil'],
      ['telefon', 'celular', 'whatsapp', 'contacto'],
      'telefono'
    );

    buscarYAsignar(
      ['direccion', 'domicilio', 'calle', 'referencia', 'ubicacion'],
      ['direccion', 'domicilio', 'calle', 'referencia', 'ubicacion'],
      'direccion',
      true
    );

    buscarYAsignar(
      ['barrio', 'colonia', 'sector', 'localidad', 'comunidad', 'zona'],
      ['barrio', 'colonia', 'sector', 'localidad'],
      'barrio'
    );

    buscarYAsignar(
      ['manzana', 'mz', 'cuadra', 'seccion'],
      ['manzana', 'cuadra'],
      'numero_manzana'
    );

    buscarYAsignar(
      ['curp', 'ine', 'identificacion', 'ife', 'dni', 'rfc'],
      ['curp', 'identificacion', 'documento'],
      'documento_identidad'
    );

    buscarYAsignar(
      ['medidor', 'numero de medidor', 'serie medidor'],
      ['medidor'],
      'numero_medidor'
    );

    buscarYAsignar(
      ['saldo', 'adeudo', 'deuda', 'pendiente', 'rezago'],
      ['saldo', 'adeudo', 'deuda'],
      'saldo_pendiente'
    );

    buscarYAsignar(
      ['notas', 'nota', 'observaciones', 'observacion', 'comentarios'],
      ['observacion', 'comentario', 'nota'],
      'notas'
    );
  }

  const tieneCampo = (campo: CampoDestinoKey) =>
    Object.values(asignacion).includes(campo);

  if (!tieneCampo('telefono')) {
    for (const col of columnas) {
      if (usadas.has(col.colIndex) || col.ejemplos.length === 0) continue;
      const parecenTelefonos = col.ejemplos.filter((ej) => {
        const soloDigitos = ej.replace(/\D/g, '');
        return soloDigitos.length >= 7 && soloDigitos.length <= 13;
      });
      if (parecenTelefonos.length >= Math.ceil(col.ejemplos.length * 0.6)) {
        asignacion[col.colIndex] = 'telefono';
        usadas.add(col.colIndex);
        break;
      }
    }
  }

  if (!tieneCampo('nombre_completo')) {
    for (const col of columnas) {
      if (usadas.has(col.colIndex) || col.ejemplos.length === 0) continue;
      const parecenNombres = col.ejemplos.filter((ej) => {
        const limpio = ej.trim();
        return (
          limpio.length >= 5 &&
          !/\d/.test(limpio) &&
          limpio.split(/\s+/).length >= 2
        );
      });
      if (parecenNombres.length >= Math.ceil(col.ejemplos.length * 0.5)) {
        asignacion[col.colIndex] = 'nombre_completo';
        usadas.add(col.colIndex);
        break;
      }
    }
  }

  return asignacion;
}

/**
 * Parsea de forma segura la cantidad de tomas sin confundir decimales.
 */
export function parsearCantidadTomasSeguro(texto: string, valorPorDefecto: number): number {
  const limpio = texto.trim();
  if (!limpio) return valorPorDefecto;

  const norm = normalizarTexto(limpio);
  if (norm === 'si' || norm === 'activa' || norm === 'activo' || norm === 'con toma') {
    return 1;
  }
  if (
    norm === 'no' ||
    norm === 'ninguna' ||
    norm === 'sin toma' ||
    norm === 'inactiva' ||
    norm === '0'
  ) {
    return 0;
  }

  const match = limpio.match(/(\d+(?:[.,]\d+)?)/);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(num)) {
      return Math.min(20, Math.max(0, Math.round(num)));
    }
  }

  return valorPorDefecto;
}

/**
 * Construye la lista de registros a importar a partir de la matriz y la asignación de columnas.
 */
export function construirRegistrosDesdeMatriz(
  matriz: FilaMatrizExcel[],
  idxEncabezado: number,
  tieneEncabezados: boolean,
  asignacion: Record<number, CampoDestinoKey>,
  mapaDocumentosExistentes: Map<string, string>,
  mapaNombresExistentes: Map<string, string>
): RegistroImportar[] {
  const filasDatos = tieneEncabezados ? matriz.slice(idxEncabezado + 1) : matriz;

  const columnasPorCampo = (campo: Exclude<CampoDestinoKey, 'ignorar'>): number[] => {
    return Object.entries(asignacion)
      .filter(([, destino]) => destino === campo)
      .map(([colIdx]) => Number(colIdx))
      .sort((a, b) => a - b);
  };

  const colsNombre = columnasPorCampo('nombre_completo');
  const colsDoc = columnasPorCampo('documento_identidad');
  const colsTel = columnasPorCampo('telefono');
  const colsDir = columnasPorCampo('direccion');
  const colsCantTomas = columnasPorCampo('cantidad_tomas');
  const colsCodigoToma = columnasPorCampo('codigo_toma');
  const colsBarrio = columnasPorCampo('barrio');
  const colsManzana = columnasPorCampo('numero_manzana');
  const colsTipoToma = columnasPorCampo('tipo_toma');
  const colsMedidor = columnasPorCampo('numero_medidor');
  const colsSaldo = columnasPorCampo('saldo_pendiente');
  const colsNotas = columnasPorCampo('notas');

  const leerUniendoColumnas = (celdas: string[], indices: number[], separador = ' '): string => {
    if (indices.length === 0) return '';
    return indices
      .map((i) => (celdas[i] || '').trim())
      .filter(Boolean)
      .join(separador)
      .replace(/\s+/g, ' ')
      .trim();
  };

  const lista: RegistroImportar[] = [];

  filasDatos.forEach((fila) => {
    const c = fila.celdas;
    let nombre = leerUniendoColumnas(c, colsNombre, ' ');

    if (!nombre) {
      const textoEnFila = c.find((val) => val && val.trim().length > 1);
      if (textoEnFila) {
        nombre = `Contribuyente Fila ${fila.numeroFilaExcel}`;
      } else {
        return;
      }
    }

    const normNombre = normalizarTexto(nombre);
    if (
      normNombre === 'nombre' ||
      normNombre === 'nombre completo' ||
      normNombre === 'nombres y apellidos' ||
      normNombre === 'titular' ||
      normNombre === 'contribuyente'
    ) {
      return;
    }

    const doc = leerUniendoColumnas(c, colsDoc, ' ');
    const tel = leerUniendoColumnas(c, colsTel, ' / ');
    const dir = leerUniendoColumnas(c, colsDir, ' ');
    const notas = leerUniendoColumnas(c, colsNotas, '. ');
    const barrioTxt = leerUniendoColumnas(c, colsBarrio, ' ');
    const manzanaTxt = leerUniendoColumnas(c, colsManzana, ' ');
    const codigoExplicito = leerUniendoColumnas(c, colsCodigoToma, ', ');
    const medidorTxt = leerUniendoColumnas(c, colsMedidor, ' ');
    const tipoTxt = leerUniendoColumnas(c, colsTipoToma, ' ');

    const saldoRaw = leerUniendoColumnas(c, colsSaldo, '');
    const saldoMatch = saldoRaw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    const saldoNum = saldoMatch ? Math.max(0, parseFloat(saldoMatch[1]) || 0) : 0;

    let cantTomas = 0;
    if (colsCantTomas.length > 0) {
      const textoCant = leerUniendoColumnas(c, colsCantTomas, '');
      cantTomas = parsearCantidadTomasSeguro(textoCant, 0);
    } else if (codigoExplicito) {
      const codigosSeparados = codigoExplicito
        .split(/[,;/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      cantTomas = codigosSeparados.length;
    }

    const idPorDoc = doc ? mapaDocumentosExistentes.get(doc.toUpperCase()) : undefined;
    const idPorNombre = mapaNombresExistentes.get(normalizarTexto(nombre));
    const personaExistenteId = idPorDoc || idPorNombre;
    const yaExiste = Boolean(personaExistenteId);

    lista.push({
      idTemporal: `ROW-${fila.numeroFilaExcel}`,
      filaOrigen: fila.numeroFilaExcel,
      seleccionado: true,
      nombre_completo: nombre,
      documento_identidad: doc,
      telefono: tel,
      direccion: dir,
      notas,
      cantidadTomas: cantTomas,
      barrioTexto: barrioTxt,
      manzanaTexto: manzanaTxt,
      codigoTomaExplicito: codigoExplicito,
      medidorTexto: medidorTxt,
      saldoInicial: saldoNum,
      tipoToma: tipoTxt ? normalizarTipoToma(tipoTxt) : 'domestica',
      yaExisteEnPadron: yaExiste,
      personaExistenteId,
    });
  });

  return lista;
}

/**
 * Descarga una plantilla Excel de ejemplo.
 */
export function descargarPlantillaExcel() {
  const datosEjemplo = [
    {
      'Nombre Completo': 'Juan Pérez Hernández',
      Teléfono: '2441234567',
      Dirección: 'Calle Morelos #12, frente a la escuela',
      'Cantidad de Tomas': 1,
      Barrio: 'Centro',
      Manzana: 'Mz 1',
      'CURP o INE': 'PEHJ800101HPLR01',
      'Tipo de Toma': 'Doméstica',
      'Código de Toma': '',
      Medidor: '',
      'Saldo Pendiente': 0,
      Observaciones: 'Censo Comunitario',
    },
    {
      'Nombre Completo': 'María López García',
      Teléfono: '2449876543',
      Dirección: 'Av. Juárez #45, portón verde',
      'Cantidad de Tomas': 0,
      Barrio: 'San Juan',
      Manzana: 'Mz 3',
      'CURP o INE': '',
      'Tipo de Toma': '',
      'Código de Toma': '',
      Medidor: '',
      'Saldo Pendiente': 0,
      Observaciones: 'Sin toma asignada',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(datosEjemplo);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Censo_Comunidad');
  XLSX.writeFile(wb, 'Plantilla_Censo_Agua_Potable.xlsx');
}

