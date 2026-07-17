import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from '../users/users.service';
import { EmitVoteDto } from './dto/emit-vote.dto';
import { FabricService } from './fabric.service';

@Controller('fabric')
export class FabricController {
  constructor(
    private readonly fabricService: FabricService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * POST /fabric/vote — flujo anti-doble-voto:
   * 1. assertCanVote: verificación rápida sin lock
   * 2. emitirVoto en Fabric → obtiene txId + voteId
   * 3. markAsVoted: SELECT FOR UPDATE atómico (race condition safe)
   * 4. saveSyncLog: guarda recibo con CONFIRMADO
   * Si Fabric falla: guarda FALLIDO, no marca votado
   */
  @Post('vote')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async vote(
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: EmitVoteDto,
  ) {
    const { userId } = req.user;

    await this.usersService.assertCanVote(userId, dto.electionId);

    let txId: string;
    let voteId: string;
    let channel: string;
    try {
      ({ txId, voteId, channel } = await this.fabricService.emitirVoto(
        userId,
        dto.electionId,
        dto.candidateId,
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (
        err instanceof HttpException &&
        err.getStatus() < Number(HttpStatus.INTERNAL_SERVER_ERROR)
      ) {
        throw err;
      }

      channel = await this.fabricService.getElectionChannel(dto.electionId);
      await this.fabricService.saveSyncLog({
        userId,
        electionId: dto.electionId,
        candidateId: dto.candidateId,
        voteId: null,
        txId: null,
        status: 'FALLIDO',
        errorMessage,
        canal: channel,
      });
      throw new BadGatewayException(
        `Fabric no pudo registrar el voto en CouchDB/ledger: ${errorMessage}`,
      );
    }

    await this.usersService.markAsVoted(userId, dto.electionId);

    await this.fabricService.saveSyncLog({
      userId,
      electionId: dto.electionId,
      candidateId: dto.candidateId,
      voteId,
      txId,
      status: 'CONFIRMADO',
      errorMessage: null,
      canal: channel,
    });

    return { txId, channel };
  }

  // Público / votante: durante una elección ACTIVA devuelve solo participación,
  // nunca el desglose por candidato (se decide en el servicio por estado).
  @Get('results/:electionId')
  getResults(@Param('electionId', ParseUUIDPipe) electionId: string) {
    return this.fabricService.getResultados(electionId);
  }

  // Administrativo: el mismo conteo pero con el desglose aunque esté ACTIVA.
  // Requiere rol ADMINISTRADOR; queda como acceso auditado, no expuesto al
  // público. (No cierra la brecha de acceso directo a la base: eso exigiria
  // cifrado, planteado como trabajo futuro.)
  @Get('results/:electionId/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR')
  getResultsAdmin(@Param('electionId', ParseUUIDPipe) electionId: string) {
    return this.fabricService.getResultados(electionId, true);
  }

  @Get('my-receipts')
  @UseGuards(JwtAuthGuard)
  getMyReceipts(@Req() req: Request & { user: { userId: string } }) {
    return this.fabricService.getUserReceipts(req.user.userId);
  }

  @Get('verify/:txId')
  verifyVote(@Param('txId') txId: string) {
    return this.fabricService.verificarVoto(this.normalizeTxId(txId));
  }

  private normalizeTxId(value: string): string {
    const decoded = decodeURIComponent(value).trim();
    const localMatches = decoded.match(/LOCAL-[0-9a-fA-F-]{36}/g);
    if (localMatches?.length) return localMatches[localMatches.length - 1];

    const fabricTxMatches = decoded.match(/\b[0-9a-fA-F]{64}\b/g);
    if (fabricTxMatches?.length)
      return fabricTxMatches[fabricTxMatches.length - 1];

    return decoded
      .replace(/^txId\s*[:=]\s*/i, '')
      .replace(/^transactionId\s*[:=]\s*/i, '')
      .trim();
  }
}
