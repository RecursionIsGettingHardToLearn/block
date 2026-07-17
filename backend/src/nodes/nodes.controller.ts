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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FabricService } from '../fabric/fabric.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { DeployNodeDto } from './dto/deploy-node.dto';
import { NodesService } from './nodes.service';

@Controller('nodes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly fabricService: FabricService,
  ) {}

  @Get()
  async findAll() {
    const { nodes, discovered } = await this.nodesService.findAll();
    // Si el descubrimiento registró peers nuevos (p. ej. la red se levantó
    // con setup.sh y la tabla estaba vacía), el backend se reconecta solo.
    if (discovered > 0) {
      await this.fabricService.reconnect();
    }
    return nodes;
  }

  @Get('free-port')
  getFreePort() {
    return this.nodesService.getNextFreePort();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateNodeDto) {
    const node = await this.nodesService.create(dto);
    await this.fabricService.reconnect();
    return node;
  }

  @Patch(':id/toggle')
  async toggle(@Param('id', ParseUUIDPipe) id: string) {
    const node = await this.nodesService.toggle(id);
    await this.fabricService.reconnect();
    return node;
  }

  @Post('deploy')
  @HttpCode(HttpStatus.ACCEPTED)
  deploy(@Body() dto: DeployNodeDto) {
    // Responde al instante con el trabajo; el despliegue corre en segundo
    // plano y el progreso se consulta en GET /nodes/deployments. La
    // reconexión a Fabric ocurre sola cuando el peer nuevo aparece en el
    // descubrimiento del listado.
    return this.nodesService.startDeploy(dto);
  }

  @Get('deployments')
  getDeployments() {
    return this.nodesService.getDeployments();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.nodesService.remove(id);
    await this.fabricService.reconnect();
  }
}
