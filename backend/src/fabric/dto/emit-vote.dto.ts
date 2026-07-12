import { IsUUID, IsString, IsNotEmpty, Matches } from 'class-validator';

export class EmitVoteDto {
  @IsUUID()
  electionId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^votos_(blancos|nulos)$/,
    {
      message:
        'candidateId debe ser un UUID válido o "votos_blancos" / "votos_nulos"',
    },
  )
  candidateId: string;
}
