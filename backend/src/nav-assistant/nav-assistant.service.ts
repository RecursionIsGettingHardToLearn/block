import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/** Un destino navegable del sistema, con las palabras que lo describen. */
interface Destino {
  id: string;
  ruta: string;
  titulo: string;
  descripcion: string;
  roles: ('ADMINISTRADOR' | 'AUDITOR' | 'VOTANTE')[];
}

/**
 * Catálogo de destinos REALES. La IA elige de esta lista por su id; nunca
 * inventa una ruta. Así una alucinación no puede mandar al usuario a una
 * página inexistente: si el id no está aquí, se descarta.
 */
const DESTINOS: Destino[] = [
  {
    id: 'admin-dashboard',
    ruta: '/admin/dashboard',
    titulo: 'Panel principal',
    descripcion: 'Resumen general del sistema para el administrador.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-elecciones',
    ruta: '/admin/elecciones',
    titulo: 'Gestión de Elecciones',
    descripcion:
      'Crear, activar, cerrar y escrutar elecciones; añadir candidatos.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-usuarios',
    ruta: '/admin/usuarios',
    titulo: 'Gestión de Usuarios',
    descripcion:
      'Crear usuarios, editar roles, y asignar votantes a canales (individual o masivo) para que puedan votar.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-resultados',
    ruta: '/admin/resultados',
    titulo: 'Resultados (admin)',
    descripcion:
      'Ver resultados por elección y el panel de participación (quiénes votaron y quiénes no).',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-nodos',
    ruta: '/admin/nodos',
    titulo: 'Nodos',
    descripcion:
      'Gestionar los peers de la red Fabric: registrar, crear y desplegar nodos.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-canales',
    ruta: '/admin/canales',
    titulo: 'Canales',
    descripcion:
      'Crear canales de Fabric, unir peers y desplegar o actualizar el chaincode.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-ca',
    ruta: '/admin/ca',
    titulo: 'Autoridad Certificadora (CA)',
    descripcion: 'Estado de la CA de Fabric y su material criptográfico.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-auditoria',
    ruta: '/admin/auditoria',
    titulo: 'Auditoría',
    descripcion: 'Registro de auditoría de acciones del sistema.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'admin-reportes',
    ruta: '/admin/reportes',
    titulo: 'Reportes de la Red',
    descripcion:
      'Generar reportes visuales del estado de la red con IA y exportarlos a PDF o Excel.',
    roles: ['ADMINISTRADOR'],
  },
  {
    id: 'auditor-resultados',
    ruta: '/auditor/resultados',
    titulo: 'Panel del Auditor',
    descripcion: 'Resumen y resultados de las elecciones para el auditor.',
    roles: ['AUDITOR'],
  },
  {
    id: 'auditor-validar',
    ruta: '/auditor/validar',
    titulo: 'Validar voto',
    descripcion:
      'Verificar un voto por su identificador de transacción en la blockchain.',
    roles: ['AUDITOR'],
  },
  {
    id: 'auditor-blockchain',
    ruta: '/auditor/blockchain',
    titulo: 'Blockchain / Auditoría',
    descripcion: 'Registro de auditoría y trazas de la cadena de bloques.',
    roles: ['AUDITOR'],
  },
  {
    id: 'auditor-reportes',
    ruta: '/auditor/reportes',
    titulo: 'Reportes de Elecciones',
    descripcion:
      'Generar reportes visuales de una elección con IA y exportarlos a PDF o Excel.',
    roles: ['AUDITOR'],
  },
  {
    id: 'votante-votar',
    ruta: '/votante/votar',
    titulo: 'Votar',
    descripcion:
      'Emitir el voto en las elecciones activas e imprimir el comprobante.',
    roles: ['VOTANTE'],
  },
];

/** Respuesta del asistente: una guía y, si aplica, un destino para el botón. */
export interface NavSuggestion {
  mensaje: string;
  destino: { ruta: string; titulo: string } | null;
  pasos: string[];
}

/** Un turno previo de la conversación, para dar continuidad. */
export interface NavTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class NavAssistantService {
  private readonly logger = new Logger(NavAssistantService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!this.config.get<string>('OPENAI_API_KEY');
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El asistente no está configurado. Define OPENAI_API_KEY en el backend.',
      );
    }
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  /**
   * Traduce lo que el usuario quiere hacer a un destino del catálogo, filtrado
   * por su rol. Devuelve un mensaje-guía, el destino (para el botón «Ir») y
   * unos pasos. Si nada encaja, destino es null y el mensaje lo explica.
   */
  async sugerir(
    rol: string,
    consulta: string,
    historial: NavTurn[] = [],
  ): Promise<NavSuggestion> {
    const client = this.getClient();
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    // Solo se ofrecen destinos que el rol puede ver.
    const disponibles = DESTINOS.filter((d) =>
      d.roles.includes(rol as Destino['roles'][number]),
    );

    const catalogo = disponibles
      .map((d) => `- id: ${d.id} | ${d.titulo}: ${d.descripcion}`)
      .join('\n');

    const system = `Eres un asistente conversacional de un sistema de votación electrónica sobre blockchain. Ayudas al usuario (rol: ${rol}) a moverse por la aplicación y respondes sus dudas sobre cómo hacer las cosas. Mantienes el hilo de la conversación: si el usuario hace una pregunta de seguimiento, la interpretas en el contexto de lo que ya se habló.

Destinos disponibles para este usuario:
${catalogo}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown) con esta forma:
{
  "destinoId": "el id EXACTO de la lista al que llevar al usuario, o null si su mensaje no requiere ir a ninguna pantalla",
  "mensaje": "tu respuesta conversacional, en español y en tono amable y cercano",
  "pasos": ["paso 1", "paso 2"]  // pasos concretos dentro de esa pantalla; [] si no aplica
}

Reglas:
- destinoId DEBE ser uno de los id listados, tal cual, o null. Nunca inventes un id ni una ruta.
- Conversa con naturalidad: puedes saludar, aclarar dudas y hacer preguntas de vuelta si la petición es ambigua (en ese caso destinoId es null hasta tener claro a dónde llevarlo).
- Si la intención corresponde a una pantalla, pon su destinoId y explica brevemente qué hará allí.
- Si la intención no corresponde a ninguna pantalla disponible para este rol, usa null y explica amablemente qué sí puede hacer.
- Los pasos deben referirse a acciones reales dentro de esa pantalla (botones, campos), no a cómo llegar.
- Todo en español.`;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          // El historial previo da continuidad conversacional.
          ...historial.map((t) => ({ role: t.role, content: t.content })),
          { role: 'user', content: consulta },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as {
        destinoId: string | null;
        mensaje: string;
        pasos?: string[];
      };

      // Validación dura: el id debe existir en el catálogo permitido. Si la IA
      // devolvió cualquier otra cosa, se trata como «sin destino».
      const match = disponibles.find((d) => d.id === parsed.destinoId);
      return {
        mensaje: parsed.mensaje ?? 'Aquí tienes una sugerencia.',
        destino: match ? { ruta: match.ruta, titulo: match.titulo } : null,
        pasos: Array.isArray(parsed.pasos) ? parsed.pasos : [],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error desconocido';
      this.logger.error(`Fallo el asistente de navegación: ${msg}`);
      throw new ServiceUnavailableException(
        'No se pudo consultar el asistente. Revisa la clave o inténtalo más tarde.',
      );
    }
  }

  /**
   * Voz → texto (Whisper). Recibe el audio grabado en el navegador y devuelve
   * el texto, para que el usuario le hable al asistente en vez de escribir.
   */
  async transcribe(audio: Buffer, filename: string): Promise<string> {
    const client = this.getClient();
    const model = this.config.get<string>('OPENAI_STT_MODEL') ?? 'whisper-1';
    try {
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
}
