import { Controller, Get, Query, Res, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { AttendanceService } from './attendance.service';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('export')
  @ApiOperation({ summary: 'Lấy dữ liệu trực tiếp từ máy chấm công và xuất file Excel' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công (vd: 192.168.1.200)' })
  @ApiQuery({ name: 'month', required: true, type: Number, description: 'Tháng cần xuất dữ liệu' })
  @ApiQuery({ name: 'year', required: true, type: Number, description: 'Năm cần xuất dữ liệu' })
  async exportAttendance(
    @Query('ip') ip: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @Res() res: Response,
  ) {
    if (!ip || !month || !year) {
      throw new HttpException('Thiếu tham số ip, month hoặc year', HttpStatus.BAD_REQUEST);
    }

    try {
      const excelBuffer = await this.attendanceService.exportAttendanceReport(ip, Number(month), Number(year));
      
      const fileName = `Bao_Cao_Cham_Cong_Thang_${month}_${year}.xlsx`;
      
      // Set Header for downloading
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      
      return res.send(excelBuffer);
    } catch (error: any) {
      throw new HttpException(error.message || 'Lỗi xử lý file', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
