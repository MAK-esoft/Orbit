import { Module } from '@nestjs/common';
import { RegionalOfficesController } from './ro.controller';
import { RegionalOfficesService } from './ro.service';

@Module({
  controllers: [RegionalOfficesController],
  providers: [RegionalOfficesService],
  exports: [RegionalOfficesService],
})
export class RegionalOfficesModule {}
