// Logística y comercio. Effi es el primer proveedor de logística; Shopify, el primero de comercio.
// Mismo contrato para todos, así agregar una logística nueva no toca el núcleo.

export interface Direccion {
  pais: string;
  provincia: string;
  ciudad: string;
  direccion: string;
  referencia?: string;
}

export interface PedidoLogistico {
  /** Id del pedido en Effi Connect (idempotencia: el mismo id nunca crea dos guías). */
  referencia: string;
  destinatario: { nombre: string; telefono: string; documento?: string; direccion: Direccion };
  items: { sku: string; cantidad: number; precioUnitario: number }[];
  contraentrega: boolean;
  valorRecaudo: number;
  divisa: string;
}

export interface GuiaCreada {
  numeroGuia: string;
  transportadora?: string;
  externalId: string;
}

export interface EstadoLogistico {
  numeroGuia: string;
  /** Texto del proveedor; se unifica con `unificarEstado` de @effi-connect/core. */
  estadoTexto: string;
  fecha: Date;
}

export interface LogisticsProvider {
  readonly id: string;
  verificarSku(sku: string): Promise<{ existe: boolean; stock?: number }>;
  crearGuia(pedido: PedidoLogistico): Promise<GuiaCreada>;
  consultarEstado(numeroGuia: string): Promise<EstadoLogistico | null>;
}

export interface ProductoComercio {
  externalId: string;
  sku?: string;
  nombre: string;
  precio: number;
  stock?: number;
}

export interface CommerceProvider {
  readonly id: string;
  listarProductos(opciones?: { cursor?: string }): Promise<{ productos: ProductoComercio[]; siguiente?: string }>;
}
