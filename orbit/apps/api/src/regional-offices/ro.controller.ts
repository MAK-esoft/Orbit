import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateRegionalOfficeDto } from './dto/create-ro.dto';
import { UpdateRegionalOfficeDto } from './dto/update-ro.dto';
import { RegionalOfficesService } from './ro.service';

@Controller('regional-offices')
export class RegionalOfficesController {
  constructor(private readonly service: RegionalOfficesService) {}

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  // Only SUPER_ADMIN can create ROs (spec §5.2).
  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateRegionalOfficeDto) {
    return this.service.create(dto);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegionalOfficeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get(':id/users')
  findUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findUsers(id);
  }
}
