import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Consultas de la pestaña Datos compartidas entre bloques: cache() evita repetirlas en la misma petición.

export type Despacho = {
  despachado: { n: number; venta: number; costo: number; costo_estimadas: number; flete: number };
  entregado: { n: number; venta: number; costo: number; costo_estimadas: number; flete: number };
  devoluciones: { n: number; flete_dev: number };
  plataformas: { effi: number; effi_entregadas: number };
  fulfillment_wallet: number;
  x4: number;
  transportadoras: { nombre: string; envios: number; flete: number }[];
};

type Gasto = { total: number; detalle: { mes: string; concepto: string; monto: number }[] };
export type Utilidad = {
  pyg: { plataforma: "Effi"; concepto: string; monto: number; n: number; excluido: boolean }[];
  pyg_total: number;
  proyeccion: { n: number; total: number; detalle: { plataforma: "Effi"; n: number; flete_dev_prom: number | null; total: number }[] | null };
  publicidad: {
    fuente: "diaria" | "mensual" | null; total: number | null; cop: number | null; dias: number | null;
    ultimo: string | null; ultimo_cargado: string | null; cuentas: { nombre: string; cop: number; monto: number }[];
  };
  gastos: { meses: string[]; apps: Gasto; admin: Gasto; operativo: Gasto };
  utilidad_neta: number;
};

// El contrato SQL todavía recibe la plataforma: Effi Connect solo trabaja con Effi.
const args = (cuenta: string, desde: string, hasta: string) =>
  ({ p_cuenta: cuenta, p_desde: desde, p_hasta: hasta, p_plataforma: "effi" });

export const kpiDespacho = cache(async (cuenta: string, desde: string, hasta: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_despacho", args(cuenta, desde, hasta));
  return { data: data as Despacho | null, error: error?.message ?? null };
});

export const kpiUtilidad = cache(async (cuenta: string, desde: string, hasta: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_utilidad", args(cuenta, desde, hasta));
  return { data: data as Utilidad | null, error: error?.message ?? null };
});

export type Pendientes = {
  inconsistencias: { plataforma: "Effi"; guia: string | null; fecha: string; transportadora: string | null; venta: number; costo: number; flete: number; flete_dev: number }[];
  proyeccion: { plataforma: "Effi"; estado: string; n: number; flete_dev_prom: number | null; flete_proyectado: number; fulfillment: number }[];
};

export const kpiPendientes = cache(async (cuenta: string, desde: string, hasta: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_pendientes", args(cuenta, desde, hasta));
  return { data: data as Pendientes | null, error: error?.message ?? null };
});

// Primer y último día con guías de la tienda (nota al pie de Datos).
export const rangoDatos = cache(async (cuenta: string) => {
  const supabase = await createClient();
  const q = (asc: boolean) => supabase.from("effi_guias").select("fecha_trans").eq("cuenta", cuenta).order("fecha_trans", { ascending: asc }).limit(1).maybeSingle();
  const [a, b] = await Promise.all([q(true), q(false)]);
  return { desde: (a.data?.fecha_trans as string | undefined) ?? null, hasta: (b.data?.fecha_trans as string | undefined) ?? null };
});
