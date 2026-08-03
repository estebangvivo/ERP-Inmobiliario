export const CATEGORIAS = ["CAJA", "VENTAS_ALQUILERES", "OBRAS", "CONTRATOS"] as const;
export const ESTADOS = ["ESPERA", "LLAMADO", "ATENDIDO", "CANCELADO"] as const;

export type Categoria = (typeof CATEGORIAS)[number];
export type EstadoTurno = (typeof ESTADOS)[number];

export type TurnoDTO = {
  id: string;
  codigo: string;
  categoria: Categoria;
  estado: EstadoTurno;
  puesto: string | null;
  creadoEn: string;
  llamadoEn: string | null;
};

export const PREFIJOS: Record<Categoria, string> = {
  CAJA: "C",
  VENTAS_ALQUILERES: "V",
  OBRAS: "O",
  CONTRATOS: "T",
};

export const ETIQUETAS_CATEGORIA: Record<Categoria, string> = {
  CAJA: "CAJA",
  VENTAS_ALQUILERES: "VENTAS/ALQUILERES",
  OBRAS: "OBRAS",
  CONTRATOS: "CONTRATOS",
};

/** Cómo debe pronunciar la voz cada categoría (evita deletrear la barra). */
export const VOZ_CATEGORIA: Record<Categoria, string> = {
  CAJA: "Caja",
  VENTAS_ALQUILERES: "Ventas y Alquileres",
  OBRAS: "Obras",
  CONTRATOS: "Contratos",
};

/** Código visible del turno: "CAJA Juan Pérez". */
export function codigoTurno(categoria: Categoria, nombre: string) {
  return `${ETIQUETAS_CATEGORIA[categoria]} ${nombre.trim()}`;
}

/** Texto natural para speechSynthesis a partir del turno. */
export function textoTurnoParaVoz(turno: {
  codigo: string;
  categoria: string;
  puesto?: string | null;
}) {
  const categoria = esCategoria(turno.categoria)
    ? VOZ_CATEGORIA[turno.categoria]
    : turno.categoria.replace(/\//g, " y ");

  const etiquetaVisible = esCategoria(turno.categoria)
    ? ETIQUETAS_CATEGORIA[turno.categoria]
    : "";

  let nombre = turno.codigo.trim();
  if (etiquetaVisible && nombre.toUpperCase().startsWith(etiquetaVisible)) {
    nombre = nombre.slice(etiquetaVisible.length).trim();
  } else {
    nombre = nombre.replace(/VENTAS\/ALQUILERES/gi, "").trim();
  }

  const puesto = (turno.puesto ?? "su puesto de atención")
    .replace(/Ventas\/Alquileres/gi, "Ventas y Alquileres")
    .replace(/VENTAS\/ALQUILERES/gi, "Ventas y Alquileres");

  return `Turno ${categoria}${nombre ? ` ${nombre}` : ""}, por favor diríjase a ${puesto}`;
}

export function etiquetaCategoria(categoria: string) {
  if (categoria in ETIQUETAS_CATEGORIA) {
    return ETIQUETAS_CATEGORIA[categoria as Categoria];
  }
  return categoria;
}

export function esCategoria(value: unknown): value is Categoria {
  return typeof value === "string" && CATEGORIAS.includes(value as Categoria);
}

export function esEstado(value: unknown): value is EstadoTurno {
  return typeof value === "string" && ESTADOS.includes(value as EstadoTurno);
}

export function limitesDelDia(fecha = new Date()) {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);

  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);

  return { inicio, fin };
}

export function claveFechaLocal(fecha = new Date()) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
