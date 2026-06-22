import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { format, parseISO, endOfMonth, isWithinInterval, differenceInMinutes } from 'date-fns';

// Require zkh-lib directly because it lacks TS definitions
const ZKLib = require('zkh-lib');

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  async exportAttendanceReport(ip: string, month: number, year: number): Promise<Buffer> {
    let zkInstance: any;
    try {
      this.logger.log(`Connecting to ZKTeco device at ${ip}...`);
      // parameters: ip, port, timeout, inport
      zkInstance = new ZKLib(ip, 4370, 10000, 4000);
      await zkInstance.createSocket();
      this.logger.log('Connected to ZKTeco successfully.');

      // 1. Fetch Users from device
      this.logger.log('Fetching users from device...');
      const usersData = await zkInstance.getUsers();
      const usersMap = new Map<string, string>();
      if (usersData && usersData.data) {
        usersData.data.forEach((u: any) => {
          // Fallback to "User {id}" if name is empty
          usersMap.set(u.userid.toString(), u.name || `User ${u.userid}`);
        });
      }

      // 2. Fetch Attendances from device
      this.logger.log('Fetching attendance logs from device...');
      const logsData = await zkInstance.getAttendances();
      let logs = logsData?.data || [];

      // Disconnect safely
      await zkInstance.disconnect();
      this.logger.log('Disconnected from ZKTeco.');

      // 3. Process Data
      const targetMonthStart = new Date(year, month - 1, 1);
      const targetMonthEnd = endOfMonth(targetMonthStart);

      // Filter logs by month and year
      logs = logs.filter((log: any) => {
        const recordDate = typeof log.recordTime === 'string' ? parseISO(log.recordTime) : new Date(log.recordTime);
        return isWithinInterval(recordDate, { start: targetMonthStart, end: targetMonthEnd });
      });

      // Group logs by User -> Date -> Times
      const reportData: any = {};
      logs.forEach((log: any) => {
        const userId = log.deviceUserId.toString();
        const userName = usersMap.get(userId) || `User ${userId}`;
        const recordDate = typeof log.recordTime === 'string' ? parseISO(log.recordTime) : new Date(log.recordTime);
        const dateStr = format(recordDate, 'yyyy-MM-dd');

        if (!reportData[userId]) {
          reportData[userId] = {
            name: userName,
            dailyRecords: {}
          };
        }

        if (!reportData[userId].dailyRecords[dateStr]) {
          reportData[userId].dailyRecords[dateStr] = [];
        }
        reportData[userId].dailyRecords[dateStr].push(recordDate);
      });

      // Calculate work hours based on 08:00 - 17:00
      const excelRows: any[] = [];
      const WORK_START = { hour: 8, minute: 0 };
      const WORK_END = { hour: 17, minute: 0 };

      for (const userId of Object.keys(reportData)) {
        const userData = reportData[userId];
        
        for (const dateStr of Object.keys(userData.dailyRecords)) {
          const times = userData.dailyRecords[dateStr];
          // Sort punches chronologically
          times.sort((a: Date, b: Date) => a.getTime() - b.getTime());

          const checkIn = times[0];
          // If only 1 punch, checkOut is null (forgot to punch)
          const checkOut = times.length > 1 ? times[times.length - 1] : null;

          let lateMinutes = 0;
          let earlyLeaveMinutes = 0;

          if (checkIn) {
            const startLimit = new Date(checkIn);
            startLimit.setHours(WORK_START.hour, WORK_START.minute, 0, 0);
            if (checkIn > startLimit) {
              lateMinutes = differenceInMinutes(checkIn, startLimit);
            }
          }

          if (checkOut) {
            const endLimit = new Date(checkOut);
            endLimit.setHours(WORK_END.hour, WORK_END.minute, 0, 0);
            if (checkOut < endLimit) {
              earlyLeaveMinutes = differenceInMinutes(endLimit, checkOut);
            }
          }

          excelRows.push({
            userId,
            name: userData.name,
            date: dateStr,
            checkIn: checkIn ? format(checkIn, 'HH:mm:ss') : '',
            checkOut: checkOut ? format(checkOut, 'HH:mm:ss') : '',
            lateMinutes,
            earlyLeaveMinutes,
            totalPunches: times.length
          });
        }
      }

      // Sort rows by User Name, then by Date
      excelRows.sort((a, b) => {
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        return a.date.localeCompare(b.date);
      });

      // 4. Generate Excel using exceljs
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Attendance Report');

      sheet.columns = [
        { header: 'Mã NV', key: 'userId', width: 10 },
        { header: 'Tên nhân viên', key: 'name', width: 25 },
        { header: 'Ngày', key: 'date', width: 15 },
        { header: 'Check-In', key: 'checkIn', width: 15 },
        { header: 'Check-Out', key: 'checkOut', width: 15 },
        { header: 'Đi trễ (phút)', key: 'lateMinutes', width: 15 },
        { header: 'Về sớm (phút)', key: 'earlyLeaveMinutes', width: 15 },
        { header: 'Số lần quét', key: 'totalPunches', width: 15 },
      ];

      // Style the header row
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

      sheet.addRows(excelRows);

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as unknown as Buffer;

    } catch (error: any) {
      this.logger.error('Error fetching data from ZKTeco', error);
      if (zkInstance) {
        try { await zkInstance.disconnect(); } catch (e) {}
      }
      throw new Error(`Lỗi khi kết nối hoặc xử lý dữ liệu từ máy chấm công: ${error.message || error}`);
    }
  }
}
