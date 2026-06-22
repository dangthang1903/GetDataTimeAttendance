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
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Mật mã kết nối máy chấm công (Comm Key), mặc định là 0 nếu không cấu hình' })
  async exportAttendance(
    @Query('ip') ip: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('commKey') commKey: string,
    @Res() res: Response,
  ) {
    if (!ip || !month || !year) {
      throw new HttpException('Thiếu tham số ip, month hoặc year', HttpStatus.BAD_REQUEST);
    }

    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      const excelBuffer = await this.attendanceService.exportAttendanceReport(ip, Number(month), Number(year), parsedCommKey);
      
      const fileName = `Bao_Cao_Cham_Cong_Thang_${month}_${year}.xlsx`;
      
      // Set Header for downloading
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      
      return res.send(excelBuffer);
    } catch (error: any) {
      throw new HttpException(error.message || 'Lỗi xử lý file', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('test-data')
  @ApiOperation({ summary: 'Lấy dữ liệu thô (JSON) từ máy chấm công để kiểm tra (debug)' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Tháng cần xuất dữ liệu (tuỳ chọn)' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Năm cần xuất dữ liệu (tuỳ chọn)' })
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Comm Key' })
  async getRawData(
    @Query('ip') ip: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('commKey') commKey: string,
  ) {
    if (!ip) {
      throw new HttpException('Thiếu tham số ip', HttpStatus.BAD_REQUEST);
    }
    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      const parsedMonth = month ? Number(month) : undefined;
      const parsedYear = year ? Number(year) : undefined;
      return await this.attendanceService.getRawAttendanceData(ip, parsedCommKey, parsedMonth, parsedYear);
    } catch (error: any) {
      throw new HttpException(error.message || 'Lỗi khi lấy dữ liệu JSON', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
