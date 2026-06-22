import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttendanceModule } from './modules/attendance/attendance.module';

@Module({
  imports: [AttendanceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
