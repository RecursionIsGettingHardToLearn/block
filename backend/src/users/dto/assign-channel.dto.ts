import { ArrayNotEmpty, IsArray, IsString, IsUUID } from 'class-validator';

/**
 * Asignación masiva de un canal a varios votantes. Es aditiva: agrega el canal
 * a cada usuario sin tocar los que ya tuviera, para no borrar asignaciones
 * existentes al sumar gente a un padrón.
 */
export class AssignChannelDto {
  @IsString()
  canal: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  usuarioIds: string[];
}
