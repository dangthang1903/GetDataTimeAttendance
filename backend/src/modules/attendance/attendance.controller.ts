import { Controller, Get, Query, Param, Res, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { AttendanceService } from './attendance.service';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Kiểm tra kết nối tới máy chấm công' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công' })
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Comm Key' })
  async pingDevice(
    @Query('ip') ip: string,
    @Query('commKey') commKey: string,
  ) {
    if (!ip) throw new HttpException('Thiếu tham số ip', HttpStatus.BAD_REQUEST);
    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      return await this.attendanceService.pingDevice(ip, parsedCommKey);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

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

  @Get('logs')
  @ApiOperation({ summary: 'Lấy toàn bộ dữ liệu chấm công của tháng' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công' })
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Comm Key' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Tháng' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Năm' })
  async getAllAttendances(
    @Query('ip') ip: string,
    @Query('commKey') commKey: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    if (!ip) throw new HttpException('Thiếu tham số ip', HttpStatus.BAD_REQUEST);
    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      const parsedMonth = month ? Number(month) : undefined;
      const parsedYear = year ? Number(year) : undefined;
      return await this.attendanceService.getAllAttendances(ip, parsedCommKey, parsedMonth, parsedYear);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('users')
  @ApiOperation({ summary: 'Lấy danh sách tất cả nhân viên (có phân trang và tìm kiếm)' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công' })
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Comm Key' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Trang hiện tại (mặc định: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng nhân viên trên 1 trang (mặc định: 10)' })
  @ApiQuery({ name: 'searchName', required: false, type: String, description: 'Tìm kiếm theo tên nhân viên' })
  async getUsersList(
    @Query('ip') ip: string,
    @Query('commKey') commKey: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('searchName') searchName: string,
  ) {
    if (!ip) throw new HttpException('Thiếu tham số ip', HttpStatus.BAD_REQUEST);
    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      const parsedPage = page ? Number(page) : 1;
      const parsedLimit = limit ? Number(limit) : 10;
      return await this.attendanceService.getUsersList(ip, parsedCommKey, parsedPage, parsedLimit, searchName);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Lấy thông tin một nhân viên bằng mã userId' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công' })
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Comm Key' })
  async getUserByUserId(
    @Query('ip') ip: string,
    @Query('commKey') commKey: string,
    @Param('userId') userId: string,
  ) {
    if (!ip) throw new HttpException('Thiếu tham số ip', HttpStatus.BAD_REQUEST);
    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      const user = await this.attendanceService.getUserByUserId(ip, parsedCommKey, userId);
      if (!user) {
        throw new HttpException('Không tìm thấy nhân viên với mã userId này', HttpStatus.NOT_FOUND);
      }
      return user;
    } catch (error: any) {
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('users/:userId/logs')
  @ApiOperation({ summary: 'Lấy danh sách điểm danh của một nhân viên (có lọc theo ngày/tháng/năm)' })
  @ApiQuery({ name: 'ip', required: true, description: 'IP máy chấm công' })
  @ApiQuery({ name: 'commKey', required: false, type: Number, description: 'Comm Key' })
  @ApiQuery({ name: 'day', required: false, type: Number, description: 'Lọc theo Ngày' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Lọc theo Tháng' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Lọc theo Năm' })
  async getAttendanceByUserId(
    @Query('ip') ip: string,
    @Query('commKey') commKey: string,
    @Param('userId') userId: string,
    @Query('day') day: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    if (!ip) throw new HttpException('Thiếu tham số ip', HttpStatus.BAD_REQUEST);
    try {
      const parsedCommKey = commKey ? Number(commKey) : 0;
      const parsedDay = day ? Number(day) : undefined;
      const parsedMonth = month ? Number(month) : undefined;
      const parsedYear = year ? Number(year) : undefined;
      return await this.attendanceService.getAttendanceByUserId(ip, parsedCommKey, userId, parsedDay, parsedMonth, parsedYear);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
