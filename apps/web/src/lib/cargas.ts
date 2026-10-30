// Lectura de los archivos que se cargan a mano mientras no hay API: Meta Ads (CSV por Business Manager).
// Se procesa en el navegador y solo se envía lo necesario: sin nombre, teléfono, correo, documento ni dirección.

export type TipoCarga = "meta_bm";
export type Celda = string | number | boolean | Date | null | undefined;
export type Fila = Record<string, unknown>;

export const NOMBRE_TIPO: Record<TipoCarga, string> = {
  meta_bm: "Meta · CSV por BM",
};

export type Lectura = {
  tipo: TipoCarga;
  filas: Fila[];
  cuenta: string | null;      // en Meta la tienda sale del país de cada fila
  desde: string | null;
  hasta: string | null;
  totales: { etiqueta: string; valor: number; moneda?: boolean }[];
  avisos: string[];
};

// Encabezado sin tildes, en mayúsculas y sin espacios dobles: "Descripción " → "DESCRIPCION".
const clave = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export function detectarTipo(encabezados: unknown[]): TipoCarga | null {
  const h = new Set(encabezados.map(clave));
  if ([...h].some((x) => x.startsWith("MONTO GASTADO") || x.startsWith("IMPORTE GASTADO")) && h.has("DIA")) return "meta_bm";
  return null;
}

// Filas de la hoja/CSV → objetos por encabezado normalizado.
export function aObjetos(tabla: Celda[][]): { encabezados: string[]; filas: Record<string, Celda>[] } {
  const [cab = [], ...resto] = tabla;
  const encabezados = cab.map(clave);
  const filas = resto
    .filter((r) => r.some((v) => v !== null && v !== undefined && String(v).trim() !== ""))
    .map((r) => Object.fromEntries(encabezados.map((h, i) => [h, r[i]])));
  return { encabezados, filas };
}

const texto = (v: Celda) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numero = (v: Celda) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pad = (n: number) => String(n).padStart(2, "0");
// "23-10-2026", "23/10/2026", "2026-10-23" o fecha de Excel → "2026-10-23"
function fecha(v: Celda): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const s = texto(v);
  if (!s) return null;
  let m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function rango(fechas: (string | null)[]) {
  const f = fechas.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort();
  return { desde: f[0] ?? null, hasta: f[f.length - 1] ?? null };
}
// País que trae el CSV (país de entrega). Si viene "unknown", se intenta con la etiqueta de la campaña: (COL), (EC), (GT)…
function paisMeta(pais: string | null, campana: string) {
  const p = (pais ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(p)) return p;
  if (/\((COL|CO)\)/i.test(campana)) return "CO";
  if (/\((ECU|EC)\)/i.test(campana)) return "EC";
  if (/\((GUA|GUATE|GT)\)/i.test(campana)) return "GT";
  return null;
}

function metaBm(filas: Record<string, Celda>[]): Lectura {
  const colMonto = Object.keys(filas[0] ?? {}).find((k) => k.startsWith("MONTO GASTADO") || k.startsWith("IMPORTE GASTADO")) ?? "";
  const avisos: string[] = [];
  if (colMonto && !colMonto.includes("COP")) avisos.push(`El monto viene en "${colMonto}"; Effi Connect espera COP.`);
  const validas = filas.filter((r) => texto(r["NOMBRE DE LA CUENTA"]) && fecha(r["DIA"])); // la primera fila es el total del informe
  const sinPais: string[] = [];
  const out = validas.flatMap((r) => {
    const campana = texto(r["NOMBRE DE LA CAMPANA"]) ?? "(sin nombre)";
    const pais = paisMeta(texto(r["PAIS"]), campana);
    if (!pais) { sinPais.push(campana); return []; }
    return [{ pais, fecha: fecha(r["DIA"]), cuenta_ads: texto(r["NOMBRE DE LA CUENTA"])!, campana, monto_cop: numero(r[colMonto]) ?? 0 }];
  });
  if (sinPais.length) avisos.push(`${sinPais.length} filas sin país se omiten (${[...new Set(sinPais)].slice(0, 3).join(", ")}).`);
  const porPais = new Map<string, number>();
  out.forEach((f) => porPais.set(f.pais, (porPais.get(f.pais) ?? 0) + f.monto_cop));
  const cuentas = [...new Set(out.map((f) => f.cuenta_ads))];
  return {
    tipo: "meta_bm",
    filas: out,
    cuenta: null,
    ...rango(out.map((f) => f.fecha)),
    totales: [
      { etiqueta: `Cuentas: ${cuentas.join(", ")}`, valor: cuentas.length },
      ...[...porPais].map(([p, v]) => ({ etiqueta: `Gasto ${p} (COP)`, valor: v })),
    ],
    avisos,
  };
}

export function leerTabla(tabla: Celda[][]): Lectura {
  const { encabezados, filas } = aObjetos(tabla);
  const tipo = detectarTipo(encabezados);
  if (tipo === "meta_bm") return metaBm(filas);
  throw new Error("No reconozco el archivo: no es un CSV de Meta Ads.");
}
