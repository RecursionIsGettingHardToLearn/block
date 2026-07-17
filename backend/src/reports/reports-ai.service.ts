import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Especificación de un reporte visual que produce la IA. El frontend la
 * renderiza como gráfico (bar/pie/line) o tabla, según `tipoVisual`.
 */
export interface ReportSpec {
  titulo: string;
  tipoVisual: 'bar' | 'pie' | 'line' | 'table';
  insight: string;
  datos?: { etiqueta: string; valor: number }[];
  tabla?: { columnas: string[]; filas: string[][] };
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
   * Genera una ESPECIFICACIÓN DE REPORTE a partir de una petición en lenguaje
   * natural y los datos disponibles. En vez de texto libre, el modelo devuelve
   * JSON estructurado que el frontend renderiza como tabla o gráfico. Así el
   * reporte es visual (y exportable), no un chat.
   */
  async generarReporte(
    contexto: unknown,
    tipo: 'red' | 'eleccion',
    peticion: string,
  ): Promise<ReportSpec> {
    const client = this.getClient();
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const ambito =
      tipo === 'red'
        ? 'el estado general de la red de votación (usuarios por rol, elecciones por estado, canales, nodos y votos)'
        : 'una elección concreta (padrón, participación y, si ya cerró, resultados por candidato)';

    const system = `Eres un generador de reportes para un sistema de votación electrónica sobre blockchain. A partir de una petición del usuario y de los DATOS en JSON, produces la especificación de UNA visualización.

Ámbito de los datos: ${ambito}.

Debes responder ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto fuera del JSON) con esta forma exacta:
{
  "titulo": "string, título del reporte",
  "tipoVisual": "bar" | "pie" | "line" | "table",
  "insight": "string, 1-2 frases interpretando los datos",
  "datos": [ { "etiqueta": "string", "valor": number }, ... ],   // para bar/pie/line
  "tabla": { "columnas": ["c1","c2",...], "filas": [["v1","v2",...], ...] }  // solo para table
}

Reglas:
- Elige el tipoVisual MÁS ADECUADO para lo que se pide: comparaciones de categorías → "bar"; proporciones de un total → "pie"; evolución/secuencia → "line"; listados con varias columnas o detalle → "table".
- Usa SOLO los datos del JSON. No inventes cifras. Si la petición no se puede responder con los datos, devuelve un tipoVisual "table" con una sola fila explicando el motivo en la primera celda.
- Para bar/pie/line incluye "datos" (no "tabla"). Para table incluye "tabla" (no "datos").
- Si los resultados por candidato están marcados como no disponibles (elección no cerrada), NO los inventes: dilo en el insight y muestra lo que sí hay (participación).
- Todo el texto en español.

DATOS (JSON):
${JSON.stringify(contexto)}`;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: peticion },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      const raw = completion.choices[0]?.message?.content ?? '{}';
      const spec = JSON.parse(raw) as ReportSpec;
      return spec;
    } catch (err: unknown) {
      const detalle = this.describeOpenAiError(err);
      this.logger.error(`Fallo la generación del reporte: ${detalle}`);
      throw new ServiceUnavailableException(
        `No se pudo generar el reporte: ${detalle}`,
      );
    }
  }

  /**
   * Extrae un mensaje útil de un error de OpenAI. El SDK expone status y un
   * cuerpo con el motivo (clave inválida, cuota agotada, modelo inexistente…);
   * se arma un texto legible en vez del genérico «error desconocido».
   */
  private describeOpenAiError(err: unknown): string {
    if (err && typeof err === 'object') {
      const e = err as {
        status?: number;
        code?: string;
        message?: string;
        error?: { message?: string; code?: string };
      };
      const partes: string[] = [];
      if (e.status) partes.push(`HTTP ${e.status}`);
      const motivo = e.error?.message ?? e.message;
      if (motivo) partes.push(motivo);
      const code = e.error?.code ?? e.code;
      if (code) partes.push(`(${code})`);
      if (partes.length) return partes.join(' ');
    }
    return err instanceof Error ? err.message : 'error desconocido';
  }
}
