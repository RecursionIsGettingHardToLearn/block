import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(1, 100)
  identificador: string;

  @IsString()
  @Length(1, 255)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEnum(['SISTEMAS', 'INFORMATICA', 'REDES'])
  career?: 'SISTEMAS' | 'INFORMATICA' | 'REDES';

  @IsEnum(['VOTANTE', 'ADMINISTRADOR', 'AUDITOR'])
  role: 'VOTANTE' | 'ADMINISTRADOR' | 'AUDITOR';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channelNames?: string[];
}
