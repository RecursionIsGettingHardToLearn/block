import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

/**
 * Un voto puntuado por el modelo de detección de anomalías. `anomalia` indica
 * si el modelo lo marcó como atípico; `score` es tanto más negativo cuanto más
 * raro; `motivos` explica en lenguaje llano por qué se marcó.
 */
export interface VotoPuntuado {
  id: string;
  idUsuario: string;
  idEleccion: string;
  creadoEn: string;
  direccionIp: string | null;
  anomalia: boolean;
  score: number;
  motivos: string[];
}

/** Respuesta del microservicio para una elección. */
export interface ReporteAnomalias {
  total: number;
  anomalas: number;
  resultados: VotoPuntuado[];
}

/** Metadatos del modelo entrenado (para mostrarlos en la interfaz). */
export interface EstadoModelo {
  entrenado: boolean;
  entrenadoEn?: string;
  nVotos?: number;
  tasaDeteccion?: number;
  falsosPositivosPct?: number;
  contamination?: number;
}

/**
 * Cliente del microservicio Python de IA (módulo ml/). La lógica de ML vive en
 * Python (scikit-learn); aquí solo se hace de puente con autenticación, para
 * que el navegador nunca hable con él directamente.
 *
 * La URL del microservicio se toma de ANOMALY_SERVICE_URL (por defecto,
 * http://localhost:8100).
 */
@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>(
      'ANOMALY_SERVICE_URL',
      'http://localhost:8100',
    );
  }

  /** Traduce errores de axios a excepciones HTTP de Nest con mensaje claro. */
  private manejarError(err: unknown): never {
    const axiosErr = err as AxiosError<{ detail?: string }>;
    const status = axiosErr.response?.status;
    const detalle = axiosErr.response?.data?.detail;

    if (status === 503) {
      this.logger.warn(`Modelo no disponible: ${detalle ?? ''}`);
      throw new ServiceUnavailableException(
        detalle ?? 'El modelo de anomalías aún no está entrenado.',
      );
    }
    if (status === 409) {
      throw new ConflictException(
        detalle ?? 'No hay datos suficientes para entrenar el modelo.',
      );
    }
    if (status === 400) {
      throw new BadRequestException(detalle ?? 'Petición inválida.');
    }

    this.logger.error(
      `No se pudo contactar el servicio de IA en ${this.baseUrl}: ${axiosErr.message}`,
    );
    throw new ServiceUnavailableException(
      'El servicio de IA no está disponible. Verifica que esté levantado ' +
        '(uvicorn servicio_anomalias:app --port 8100).',
    );
  }

  /** Metadatos del modelo activo (o { entrenado: false } si no hay). */
  async estado(): Promise<EstadoModelo> {
    try {
      const { data } = await axios.get<EstadoModelo>(`${this.baseUrl}/estado`, {
        timeout: 15_000,
      });
      return data;
    } catch (err: unknown) {
      this.manejarError(err);
    }
  }

  /** Entrena el modelo con los datos actuales de la BD. Devuelve los metadatos. */
  async entrenar(): Promise<EstadoModelo> {
    try {
      const { data } = await axios.post<EstadoModelo>(
        `${this.baseUrl}/entrenar`,
        {},
        { timeout: 120_000 },
      );
      return data;
    } catch (err: unknown) {
      this.manejarError(err);
    }
  }

  /** Reemplaza el modelo activo por uno subido (.joblib). */
  async subirModelo(buffer: Buffer, filename: string): Promise<EstadoModelo> {
    const form = new FormData();
    form.append('archivo', buffer, { filename: filename || 'modelo.joblib' });
    try {
      const { data } = await axios.post<EstadoModelo>(
        `${this.baseUrl}/modelo`,
        form,
        { headers: form.getHeaders(), timeout: 60_000 },
      );
      return data;
    } catch (err: unknown) {
      this.manejarError(err);
    }
  }

  /**
   * Puntúa los votos de una elección. Devuelve todos los votos con su bandera y
   * score (los más anómalos primero).
   */
  async detectar(electionId?: string): Promise<ReporteAnomalias> {
    try {
      const { data } = await axios.get<ReporteAnomalias>(
        `${this.baseUrl}/anomalias`,
        {
          params: electionId ? { eleccion: electionId } : {},
          timeout: 30_000,
        },
      );
      return data;
    } catch (err: unknown) {
      this.manejarError(err);
    }
  }
}
