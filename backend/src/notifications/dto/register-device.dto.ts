import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsIn(['android', 'ios'])
  plataforma?: 'android' | 'ios';
}
