import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

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
}
