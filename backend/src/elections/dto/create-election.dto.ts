import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Validate,
} from 'class-validator';
import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'EndAfterStart' })
class EndAfterStart implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const obj = args.object as CreateElectionDto;
    return obj.endDate > obj.startDate;
  }
  defaultMessage() {
    return 'end_date must be after start_date';
  }
}

export class CreateElectionDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  @Validate(EndAfterStart)
  endDate: Date;

  @IsOptional()
  @IsString()
  channelName?: string;
}
