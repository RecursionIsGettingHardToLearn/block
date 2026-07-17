import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9-]{2,48}$/, {
    message:
      'Nombre inválido: minúsculas, letras/números/guiones, 3-49 chars, empieza con letra',
  })
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  /**
   * Si es false, solo se crea el canal en el orderer (bloque génesis) y se
   * registra: los peers se unen después, uno a uno, y el chaincode se
   * despliega cuando haya al menos uno unido. Por defecto se une a todos los
   * peers activos y se despliega el chaincode, como hasta ahora.
   */
  @IsOptional()
  @IsBoolean()
  unirPeers?: boolean;
}
