import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/** Un turno del chat: quién habló y qué dijo. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Envuelve la API de OpenAI para conversar SOBRE los datos de un reporte. La
 * clave vive solo en el backend (nunca se expone al navegador): el frontend
 * manda la pregunta y los datos ya recopilados, y aquí se arma el prompt.
 */
@Injectable()
export class ReportsAiService {
  private readonly logger = new Logger(ReportsAiService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /** ¿Está configurada la clave? La interfaz lo consulta para habilitar el chat. */
  isEnabled(): boolean {
    return !!this.config.get<string>('OPENAI_API_KEY');
  }

  /**
   * Transcribe audio a texto con Whisper (voz → texto). Recibe el buffer del
   * archivo de audio grabado en el navegador. Devuelve el texto reconocido.
   */
  async transcribe(audio: Buffer, filename: string): Promise<string> {
    const client = this.getClient();
    const model = this.config.get<string>('OPENAI_STT_MODEL') ?? 'whisper-1';
    try {
      // toFile envuelve el buffer como archivo subible, sin tocar el disco.
      const { toFile } = await import('openai');
      const file = await toFile(audio, filename);
      const result = await client.audio.transcriptions.create({
        file,
        model,
        language: 'es',
      });
      return result.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error desconocido';
      this.logger.error(`Fallo la transcripción (Whisper): ${msg}`);
      throw new ServiceUnavailableException(
        'No se pudo transcribir el audio. Revisa la clave o inténtalo más tarde.',
      );
    }
  }

  /**
   * Sintetiza voz a partir de texto (texto → voz) con el TTS de OpenAI.
   * Devuelve el audio en MP3 como buffer, para que la interfaz lo reproduzca.
   */
  async synthesize(texto: string): Promise<Buffer> {
    const client = this.getClient();
    const model = this.config.get<string>('OPENAI_TTS_MODEL') ?? 'tts-1';
    const voice = this.config.get<string>('OPENAI_TTS_VOICE') ?? 'alloy';
    try {
      const response = await client.audio.speech.create({
        model,
        voice,
        input: texto,
      });
      return Buffer.from(await response.arrayBuffer());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error desconocido';
      this.logger.error(`Fallo la síntesis de voz (TTS): ${msg}`);
      throw new ServiceUnavailableException(
        'No se pudo generar el audio. Revisa la clave o inténtalo más tarde.',
      );
    }
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El chat con IA no está configurado. Define OPENAI_API_KEY en el backend.',
      );
    }
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  /**
   * Responde una pregunta del usuario usando los datos del reporte como
   * contexto. El modelo se instruye para responder solo con esos datos y en
   * español, como analista electoral.
   */
  async chat(
    contexto: unknown,
    tipo: 'red' | 'eleccion',
    historial: ChatMessage[],
    pregunta: string,
  ): Promise<string> {
    const client = this.getClient();
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const rol =
      tipo === 'red'
        ? 'el estado general de la red de votación (usuarios, elecciones, canales, nodos y votos)'
        : 'una elección concreta (participación y, si ya cerró, resultados)';

    const system = `Eres un analista de un sistema de votación electrónica sobre blockchain (Hyperledger Fabric). Respondes preguntas sobre ${rol}. Reglas:
- Usa ÚNICAMENTE los datos del reporte que se te entregan en JSON. No inventes cifras.
- Si te preguntan algo que los datos no permiten responder, dilo con claridad.
- Si los resultados por candidato están marcados como no disponibles (elección aún no cerrada), NO especules sobre quién va ganando: explica que se revelan al cierre.
- Responde en español, de forma concisa y profesional, apto para un reporte.
- Cuando sea útil, resume en cifras y porcentajes.

Datos del reporte (JSON):
${JSON.stringify(contexto)}`;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          ...historial.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: pregunta },
        ],
        temperature: 0.2,
      });
      return (
        completion.choices[0]?.message?.content ??
        'No se obtuvo respuesta del modelo.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error desconocido';
      this.logger.error(`Fallo la llamada a OpenAI: ${msg}`);
      throw new ServiceUnavailableException(
        'No se pudo consultar el servicio de IA. Revisa la clave o inténtalo más tarde.',
      );
    }
  }
}
