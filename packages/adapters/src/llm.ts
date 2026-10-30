// Modelos de lenguaje con la clave de cada organización (BYOK). La plataforma no paga ni guarda tokens de IA propios.

export interface MensajeLLM {
  role: 'user' | 'assistant';
  content: string;
}

export interface HerramientaLLM {
  name: string;
  description: string;
  /** JSON Schema de los argumentos. */
  inputSchema: Record<string, unknown>;
}

export interface PeticionLLM {
  system?: string;
  messages: MensajeLLM[];
  model?: string;
  maxTokens?: number;
  tools?: HerramientaLLM[];
}

export interface LlamadaHerramienta {
  name: string;
  input: Record<string, unknown>;
}

export interface RespuestaLLM {
  text: string;
  toolCalls: LlamadaHerramienta[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  /** "anthropic", "openai", "google", "gateway"… */
  readonly id: string;
  readonly modeloPorDefecto: string;
  chat(peticion: PeticionLLM): Promise<RespuestaLLM>;
}

/** Credencial que la organización configuró. `apiKey` se lee del Vault solo en el servidor. */
export interface CredencialLLM {
  provider: string;
  apiKey: string;
  model?: string;
}

export type FabricaLLM = (credencial: CredencialLLM) => LLMProvider;
