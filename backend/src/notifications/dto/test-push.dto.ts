import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TestPushDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  cuerpo?: string;
}
