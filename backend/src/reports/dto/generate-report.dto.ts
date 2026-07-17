import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** Petición para generar un reporte visual a partir de lenguaje natural. */
export class GenerateReportDto {
  /** 'red' (admin) o 'eleccion' (auditor). */
  @IsIn(['red', 'eleccion'])
  tipo: 'red' | 'eleccion';

  /** Requerido cuando tipo = 'eleccion'. */
  @IsOptional()
  @IsUUID()
  electionId?: string;

  /** Lo que el usuario quiere ver, en lenguaje natural. */
  @IsString()
  peticion: string;
}
