// Canales de conversación: WhatsApp Cloud API, redes sociales (p. ej. vía Zernio), voz, SMS, correo.

export type TipoCanal = 'whatsapp' | 'social' | 'voz' | 'sms' | 'email';

export interface Contacto {
  /** Identificador en el canal: teléfono E.164, id de usuario de la red, correo… */
  externalId: string;
  nombre?: string;
  telefono?: string;
}

export interface MensajeEntrante {
  canal: string;
  externalMessageId: string;
  contacto: Contacto;
  texto?: string;
  adjuntos?: { tipo: 'imagen' | 'audio' | 'video' | 'documento'; url: string }[];
  recibidoEn: Date;
  /** Datos originales del proveedor, para auditoría. */
  crudo?: unknown;
}

export interface MensajeSaliente {
  para: Contacto;
  texto?: string;
  /** Plantilla aprobada (WhatsApp exige plantilla fuera de la ventana de 24 h). */
  plantilla?: { nombre: string; idioma: string; variables?: string[] };
}

export interface PeticionEntrante {
  headers: Headers;
  /** Cuerpo crudo: se necesita tal cual para verificar firmas. */
  body: string;
}

export interface ChannelProvider {
  /** "whatsapp-cloud", "zernio", "vapi"… */
  readonly id: string;
  readonly tipo: TipoCanal;
  enviar(mensaje: MensajeSaliente): Promise<{ externalMessageId: string }>;
  /**
   * Verifica la firma del webhook del proveedor y lo traduce a mensajes.
   * Debe lanzar `FirmaInvalida` si la firma no coincide.
   */
  recibir(peticion: PeticionEntrante): Promise<MensajeEntrante[]>;
}

export class FirmaInvalida extends Error {
  constructor(canal: string) {
    super(`Firma inválida en el webhook de ${canal}`);
    this.name = 'FirmaInvalida';
  }
}
