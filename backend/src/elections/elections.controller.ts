import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateElectionDto } from './dto/create-election.dto';
import { UpdateElectionStatusDto } from './dto/update-election-status.dto';
import { ElectionsService } from './elections.service';

@Controller('elections')
@UseGuards(JwtAuthGuard)
export class ElectionsController {
  constructor(private readonly electionsService: ElectionsService) {}

  // ── Elections ────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  createElection(@Body() dto: CreateElectionDto) {
    return this.electionsService.createElection(dto);
  }

  @Get()
  findAll(@Req() req: Request & { user: { role: string; userId: string } }) {
    if (req.user.role === 'VOTANTE') {
      return this.electionsService.findCurrentVoterElections(req.user.userId);
    }
    return this.electionsService.findAllElections();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.electionsService.findElectionById(id);
  }

  @Get(':id/participation')
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  participation(@Param('id', ParseUUIDPipe) id: string) {
    return this.electionsService.getParticipation(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateElectionStatusDto,
  ) {
    return this.electionsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  deleteElection(@Param('id', ParseUUIDPipe) id: string) {
    return this.electionsService.deleteElection(id);
  }

  // ── Candidates ───────────────────────────────────────────────────────────

  @Post(':electionId/candidates')
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  createCandidate(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: CreateCandidateDto,
  ) {
    return this.electionsService.createCandidate({ ...dto, electionId });
  }

  @Get(':id/candidates')
  findCandidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.electionsService.findCandidatesByElection(id);
  }

  @Delete(':electionId/candidates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  deleteCandidate(@Param('id', ParseUUIDPipe) id: string) {
    return this.electionsService.deleteCandidate(id);
  }
}
