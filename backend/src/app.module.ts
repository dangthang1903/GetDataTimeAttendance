import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AttendanceModule } from './modules/attendance/attendance.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)', '/attendance/(.*)'],
    }),
    AttendanceModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
