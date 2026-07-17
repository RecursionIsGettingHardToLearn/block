import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignChannelDto } from './dto/assign-channel.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

function sanitize(user: Awaited<ReturnType<UsersService['findById']>>) {
  if (!user) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: Request & { user: { userId: string } }) {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return sanitize(user);
  }

  @Get()
  @Roles('ADMINISTRADOR')
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(sanitize);
  }

  @Post()
  @Roles('ADMINISTRADOR')
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return sanitize(user);
  }

  @Patch(':id')
  @Roles('ADMINISTRADOR')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.update(id, dto);
    return sanitize(user);
  }

  @Post('assign-channel')
  @Roles('ADMINISTRADOR')
  async assignChannel(@Body() dto: AssignChannelDto) {
    return this.usersService.assignChannelToMany(dto.canal, dto.usuarioIds);
  }

  @Delete(':id')
  @Roles('ADMINISTRADOR')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'Usuario eliminado' };
  }
}
