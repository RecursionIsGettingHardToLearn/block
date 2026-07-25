import { IsString, MaxLength, MinLength } from 'class-validator';

/** Lo que el usuario quiere hacer, en lenguaje natural. */
export class NavQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  consulta: string;
}
