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
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateChannelDto) {
    return this.channelsService.createChannel(dto);
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
