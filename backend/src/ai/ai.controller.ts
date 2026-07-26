import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AnomalyService,
  EstadoModelo,
  ReporteAnomalias,
} from './anomaly.service';

/** Solo los campos del archivo subido que este controlador necesita. */
interface ModeloSubido {
  buffer: Buffer;
  originalname: string;
}

/**
 * Sección IA: gestión del modelo de detección de anomalías (estado,
 * entrenamiento, subida) y la propia detección. Todo requiere rol
 * ADMIN/ADMINISTRADOR o AUDITOR.
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ADMINISTRADOR', 'AUDITOR')
export class AiController {
  constructor(private readonly anomaly: AnomalyService) {}

  /** Estado del modelo activo (para la tarjeta de estado en la interfaz). */
  @Get('status')
  status(): Promise<EstadoModelo> {
    return this.anomaly.estado();
  }

  /** Entrena el modelo con los datos actuales de la BD. */
  @Post('train')
  train(): Promise<EstadoModelo> {
    return this.anomaly.entrenar();
  }

  /** Reemplaza el modelo activo por uno subido (.joblib). */
  @Post('upload')
  @UseInterceptors(FileInterceptor('archivo'))
  upload(@UploadedFile() archivo?: ModeloSubido): Promise<EstadoModelo> {
    if (!archivo) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    return this.anomaly.subirModelo(
      archivo.buffer,
      archivo.originalname || 'modelo.joblib',
    );
  }

  /** Votos puntuados por el modelo, los más anómalos primero. */
  @Get('anomalies')
  anomalies(
    @Query('electionId') electionId?: string,
  ): Promise<ReporteAnomalias> {
    return this.anomaly.detectar(electionId);
  }
}
