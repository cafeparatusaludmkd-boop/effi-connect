// Datos por cuenta y semáforos de % devolución (docs/reglas-negocio.md §5).

// Cada cuenta de Effi se identifica por un slug que termina en el código de país (TIENDA_CO, MITIENDA_GT, ...). De ese
// código salen país, bandera, moneda, zona horaria e indicativo; así una cuenta nueva funciona igual en todos los
// módulos sin tocar código. El orden de PAISES es el orden de las banderas.
export type InfoCuenta = {
  pais: string; nombre: string; bandera: string; divisa: string; decimales: number; verde: number; naranja: number;
  zona: string; indicativo: string;
};

type InfoPais = Omit<InfoCuenta, "pais">;

export const PAISES: Record<string, InfoPais> = {
  CO: { nombre: "Colombia", bandera: "🇨🇴", divisa: "COP", decimales: 0, verde: 0.25, naranja: 0.32, zona: "America/Bogota", indicativo: "57" },
  EC: { nombre: "Ecuador", bandera: "🇪🇨", divisa: "USD", decimales: 2, verde: 0.25, naranja: 0.35, zona: "America/Guayaquil", indicativo: "593" },
  GT: { nombre: "Guatemala", bandera: "🇬🇹", divisa: "GTQ", decimales: 0, verde: 0.22, naranja: 0.3, zona: "America/Guatemala", indicativo: "502" },
  CR: { nombre: "Costa Rica", bandera: "🇨🇷", divisa: "CRC", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Costa_Rica", indicativo: "506" },
};
export const ORDEN_PAISES = Object.keys(PAISES);

// Código de país de un slug: lo que va después del último "_" (TIENDA_CO -> CO). "" si no hay.
export const paisDeSlug = (slug: string): string => {
  const i = slug.lastIndexOf("_");
  return i >= 0 ? slug.slice(i + 1).toUpperCase() : "";
};

// Nombre visible: las cuentas "TIENDA_XX" se muestran con el nombre del país; las demás, con su prefijo (MI_EMPRESA_GT -> Mi Empresa).
const nombreDeSlug = (slug: string, pais: InfoPais | undefined): string => {
  const prefijo = slug.includes("_") ? slug.slice(0, slug.lastIndexOf("_")) : slug;
  if (pais && prefijo.toUpperCase() === "TIENDA") return pais.nombre;
  return prefijo.toLowerCase().split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || slug;
};

// Orden de las cuentas: primero por país (el de PAISES), luego las de países desconocidos al final.
export const ordenCuenta = (slug: string) => {
  const i = ORDEN_PAISES.indexOf(paisDeSlug(slug));
  return i >= 0 ? i : 99;
};

// Fulfillment Effi por guía despachada: GT Q6,50 · EC $0,95.
// Colombia no tiene fulfillment: paga 4x1000 sobre el recaudo (ya viene cobrado en el wallet).
export const TARIFA_FULFILLMENT: Record<string, number> = { TIENDA_GT: 6.5, TIENDA_EC: 0.95 };

export const infoCuenta = (slug: string): InfoCuenta => {
  const pais = paisDeSlug(slug);
  const p = PAISES[pais];
  if (p) return { ...p, pais, nombre: nombreDeSlug(slug, p) };
  return { pais: "", nombre: slug, bandera: "🏳️", divisa: "", decimales: 0, verde: 0.25, naranja: 0.35, zona: "America/Bogota", indicativo: "" };
};

export type Semaforo = "verde" | "naranja" | "rojo" | "nada";

export function semaforoDevolucion(slug: string, pct: number | null | undefined): Semaforo {
  if (pct == null) return "nada";
  const c = infoCuenta(slug);
  return pct <= c.verde ? "verde" : pct <= c.naranja ? "naranja" : "rojo";
}

// Efectividad por ciudad: verde ≥70 %, amarillo ≥50 % (docs/reglas-negocio.md §5).
export function semaforoEfectividad(ef: number | null | undefined): Semaforo {
  if (ef == null) return "nada";
  return ef >= 0.7 ? "verde" : ef >= 0.5 ? "naranja" : "rojo";
}

export const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: "var(--green)",
  naranja: "var(--amber)",
  rojo: "var(--red)",
  nada: "var(--muted)",
};
