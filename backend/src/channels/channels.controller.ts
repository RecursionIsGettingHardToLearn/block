import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  findAll() {
    return this.channelsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateChannelDto) {
    // Responde al instante con el trabajo; la creación corre en segundo
    // plano y el progreso se consulta en GET /channels/creations.
    return this.channelsService.startCreate(dto);
  }

  @Get('creations')
  getCreations() {
    return this.channelsService.getCreations();
  }

  @Post(':channelName/peers/:nodeId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  joinPeer(
    @Param('channelName') channelName: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
  ) {
    return this.channelsService.joinPeer(channelName, nodeId);
  }

  @Post(':channelName/chaincode')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  deployChaincode(@Param('channelName') channelName: string) {
    return this.channelsService.deployChaincode(channelName);
  }
}
