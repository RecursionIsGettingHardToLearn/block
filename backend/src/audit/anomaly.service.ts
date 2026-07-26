import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

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

/**
 * Cliente del microservicio Python de detección de anomalías (ml/). La lógica
 * de ML vive en Python (scikit-learn); aquí solo se hace de puente con
 * autenticación, para que el navegador nunca hable con él directamente.
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

  /**
   * Puntúa los votos de una elección. Devuelve todos los votos con su bandera y
   * score (los más anómalos primero). Si el microservicio no está disponible o
   * el modelo aún no se ha entrenado, lanza 503 con un mensaje claro.
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
      const axiosErr = err as AxiosError<{ detail?: string }>;

      // El servicio respondió 503 = modelo sin entrenar. Se propaga tal cual.
      if (axiosErr.response?.status === 503) {
        const detalle =
          axiosErr.response.data?.detail ??
          'El modelo de anomalías aún no está entrenado.';
        this.logger.warn(`Modelo no disponible: ${detalle}`);
        throw new ServiceUnavailableException(detalle);
      }

      // No se pudo contactar al microservicio (caído, puerto cerrado, etc.).
      this.logger.error(
        `No se pudo contactar el servicio de anomalías en ${this.baseUrl}: ${axiosErr.message}`,
      );
      throw new ServiceUnavailableException(
        'El servicio de detección de anomalías no está disponible. ' +
          'Verifica que esté levantado (uvicorn servicio_anomalias:app --port 8100).',
      );
    }
  }
}
