import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { format, parseISO, endOfMonth, isWithinInterval, differenceInMinutes } from 'date-fns';

// Require zkh-lib directly because it lacks TS definitions
const ZKLib = require('zkh-lib');

// Helper functions for ZKTeco connection authentication
function makeCommKey(key: number, sessionId: number, ticks: number = 50): Buffer {
  const keyVal = BigInt(key);
  let kVal = 0n;
  for (let i = 0; i < 32; i++) {
    if ((keyVal & (1n << BigInt(i))) !== 0n) {
      kVal = (kVal << 1n) | 1n;
    } else {
      kVal = kVal << 1n;
    }
  }
  
  kVal = (kVal + BigInt(sessionId)) & 0xFFFFFFFFn;
  
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(Number(kVal), 0);
  
  const b0 = buf[0] ^ 90; // 'Z'
  const b1 = buf[1] ^ 75; // 'K'
  const b2 = buf[2] ^ 83; // 'S'
  const b3 = buf[3] ^ 79; // 'O'
  
  const s0 = b2;
  const s1 = b3;
  const s2 = b0;
  const s3 = b1;
  
  const B = 0xFF & ticks;
  
  const resultBuf = Buffer.alloc(4);
  resultBuf[0] = s0 ^ B;
  resultBuf[1] = s1 ^ B;
  resultBuf[2] = B;
  resultBuf[3] = s3 ^ B;
  
  return resultBuf;
}

function patchZKInstance(zkInstance: any) {
  if (!zkInstance || !zkInstance.jtcp) return;

  const { decodeTCPHeader, checkNotEventTCP, exportErrorMessage, createTCPHeader } = require('zkh-lib/src/helper/utils');
  const { COMMANDS } = require('zkh-lib/src/command');

  zkInstance.jtcp.readWithBuffer = function(reqData: any, cb: any = null) {
    return new Promise(async (resolve, reject) => {
      this.replyId++;
      const buf = createTCPHeader(COMMANDS.CMD_DATA_WRRQ, this.sessionId, this.replyId, reqData);
      
      let reply: any = null;
      try {
        reply = await this.requestData(buf);
      } catch (err) {
        return reject(err);
      }
      
      if (!reply) {
        return reject(new Error('No response received from the device (unauthorized or connection timed out).'));
      }
      
      try {
        const header = decodeTCPHeader(reply.subarray(0, 16));
        switch (header.commandId) {
          case COMMANDS.CMD_DATA: {
            resolve({ data: reply.subarray(16), mode: 8 });
            break;
          }
          case COMMANDS.CMD_ACK_OK:
          case COMMANDS.CMD_PREPARE_DATA: {
            const recvData = reply.subarray(16);
            const size = recvData.readUIntLE(1, 4);
            let remain = size % 65472; // MAX_CHUNK
            let numberChunks = Math.round(size - remain) / 65472;
            let totalPackets = numberChunks + (remain > 0 ? 1 : 0);
            let replyData = Buffer.from([]);
            let totalBuffer = Buffer.from([]);
            let realTotalBuffer = Buffer.from([]);
            const timeout = 10000;
            let timer = setTimeout(() => {
              internalCallback(replyData, new Error('TIMEOUT WHEN RECEIVING PACKET'));
            }, timeout);
            const internalCallback = (replyData: any, err: any = null) => {
              timer && clearTimeout(timer);
              resolve({ data: replyData, err });
            };
            const handleOnData = (replyMsg: any) => {
              if (checkNotEventTCP(replyMsg)) return;
              clearTimeout(timer);
              timer = setTimeout(() => {
                internalCallback(replyData, new Error(`TIME OUT !! ${totalPackets} PACKETS REMAIN !`));
              }, timeout);
              totalBuffer = Buffer.concat([totalBuffer, replyMsg]);
              const packetLength = totalBuffer.readUIntLE(4, 2);
              if (totalBuffer.length >= 8 + packetLength) {
                realTotalBuffer = Buffer.concat([realTotalBuffer, totalBuffer.subarray(16, 8 + packetLength)]);
                totalBuffer = totalBuffer.subarray(8 + packetLength);
                if ((totalPackets > 1 && realTotalBuffer.length === 65472 + 8)
                  || (totalPackets === 1 && realTotalBuffer.length === remain + 8)) {
                  replyData = Buffer.concat([replyData, realTotalBuffer.subarray(8)]);
                  totalBuffer = Buffer.from([]);
                  realTotalBuffer = Buffer.from([]);
                  totalPackets -= 1;
                  cb && cb(replyData.length, size);
                  if (totalPackets <= 0) {
                    internalCallback(replyData);
                  }
                }
              }
            };
            this.socket.once('close', () => {
              internalCallback(replyData, new Error('Socket is disconnected unexpectedly'));
            });
            this.socket.on('data', handleOnData);
            for (let i = 0; i <= numberChunks; i++) {
              if (i === numberChunks) {
                this.sendChunkRequest(numberChunks * 65472, remain);
              } else {
                this.sendChunkRequest(i * 65472, 65472);
              }
            }
            break;
          }
          default: {
            reject(new Error('ERROR_IN_UNHANDLE_CMD ' + exportErrorMessage(header.commandId)));
          }
        }
      } catch (err) {
        reject(err);
      }
    });
  };
}

function processAttendanceData(logs: any[], usersMap: Map<string, string>) {
  const reportData: any = {};
  
  // Group logs by User -> Date -> Times
  logs.forEach((log: any) => {
    if (log.deviceUserId === undefined || log.deviceUserId === null) return;
    const userId = log.deviceUserId.toString();
    const userName = usersMap.get(userId) || `User ${userId}`;
    const timeStr = log.recordTime || log.time || log.timestamp;
    const recordDate = new Date(timeStr);
    if (isNaN(recordDate.getTime())) return;
    
    const dateStr = format(recordDate, 'yyyy-MM-dd');

    if (!reportData[userId]) {
      reportData[userId] = { name: userName, dailyRecords: {} };
    }
    if (!reportData[userId].dailyRecords[dateStr]) {
      reportData[userId].dailyRecords[dateStr] = [];
    }
    reportData[userId].dailyRecords[dateStr].push(recordDate);
  });

  const processedRows: any[] = [];
  const WORK_START = { hour: 8, minute: 0 };
  const WORK_END = { hour: 17, minute: 0 };

  for (const userId of Object.keys(reportData)) {
    const userData = reportData[userId];
    for (const dateStr of Object.keys(userData.dailyRecords)) {
      const times = userData.dailyRecords[dateStr];
      times.sort((a: Date, b: Date) => a.getTime() - b.getTime());

      const checkIn = times[0];
      const checkOut = times.length > 1 ? times[times.length - 1] : null;

      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;
      let workingHours = 0;

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
        
        // Calculate working hours with 1 hour lunch break deduction if applicable
        let diffMs = checkOut.getTime() - checkIn.getTime();
        let diffHours = diffMs / (1000 * 60 * 60);
        
        // Deduct 1 hour lunch break if check-in is before 12:00 and check-out is after 13:00
        const lunchStart = new Date(checkIn);
        lunchStart.setHours(12, 0, 0, 0);
        const lunchEnd = new Date(checkIn);
        lunchEnd.setHours(13, 0, 0, 0);
        
        if (checkIn < lunchStart && checkOut > lunchEnd) {
          diffHours -= 1;
        }
        workingHours = diffHours > 0 ? Number(diffHours.toFixed(2)) : 0;
      }

      processedRows.push({
        userId,
        name: userData.name,
        date: dateStr,
        checkIn: checkIn ? format(checkIn, 'HH:mm:ss') : '',
        checkOut: checkOut ? format(checkOut, 'HH:mm:ss') : '',
        lateMinutes,
        earlyLeaveMinutes,
        totalPunches: times.length,
        workingHours
      });
    }
  }

  return processedRows;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  async pingDevice(ip: string, commKey: number = 0): Promise<{ status: string, message: string }> {
    let zkInstance: any;
    try {
      zkInstance = await this.connectToDevice(ip, commKey);
      await zkInstance.disconnect();
      return { status: 'success', message: 'Kết nối thành công' };
    } catch (error: any) {
      if (zkInstance) try { await zkInstance.disconnect(); } catch (e) {}
      throw new Error('Đăng nhập thất bại');
    }
  }

  async exportAttendanceReport(ip: string, month: number, year: number, commKey: number = 0): Promise<Buffer> {
    let zkInstance: any;
    try {
      this.logger.log(`Connecting to ZKTeco device at ${ip}...`);
      zkInstance = await this.connectToDevice(ip, commKey);

      this.logger.log('Fetching users from device...');
      const usersData = await zkInstance.getUsers();
      const usersMap = new Map<string, string>();
      if (usersData && usersData.data) {
        usersData.data.forEach((u: any) => {
          const uid = (u.userId ?? u.userid ?? u.uid ?? '').toString();
          if (uid) usersMap.set(uid, u.name || `User ${uid}`);
        });
      }

      this.logger.log('Fetching attendance logs from device...');
      const logsData = await zkInstance.getAttendances();
      let logs = logsData?.data || [];

      await zkInstance.disconnect();
      this.logger.log('Disconnected from ZKTeco.');

      const targetMonthStart = new Date(year, month - 1, 1);
      const targetMonthEnd = endOfMonth(targetMonthStart);

      // Filter logs by month and year
      logs = logs.filter((log: any) => {
        const timeStr = log.recordTime || log.time || log.timestamp;
        if (!timeStr) return false;
        const recordDate = new Date(timeStr);
        if (isNaN(recordDate.getTime())) return false;
        return isWithinInterval(recordDate, { start: targetMonthStart, end: targetMonthEnd });
      });

      // Process Data
      const processedRows = processAttendanceData(logs, usersMap);

      // Group Data by User
      const groupedByUsers = new Map<string, any>();
      for (const row of processedRows) {
        if (!groupedByUsers.has(row.userId)) {
          groupedByUsers.set(row.userId, {
            userId: row.userId,
            name: row.name,
            days: {},
            totalWorkingHours: 0
          });
        }
        const u = groupedByUsers.get(row.userId);
        u.days[row.date] = row;
        u.totalWorkingHours += (row.workingHours || 0);
      }

      // Generate Excel using exceljs
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Bảng Chấm Công');

      const daysInMonth = new Date(year, month, 0).getDate();
      const weekdayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

      // Row 1, 2, 3 Headers
      sheet.getCell(1, 1).value = 'Mã NV';
      sheet.mergeCells(1, 1, 3, 1);
      sheet.getColumn(1).width = 10;

      sheet.getCell(1, 2).value = 'Tên nhân viên';
      sheet.mergeCells(1, 2, 3, 2);
      sheet.getColumn(2).width = 25;

      const headerFillNormal = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
      const headerFillWeekend = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE26B0A' } }; // Orange for weekends
      const fontWhiteBold = { bold: true, color: { argb: 'FFFFFFFF' } };

      const styleCell = (r: number, c: number, fill: any) => {
        const cell = sheet.getCell(r, c);
        cell.fill = fill;
        cell.font = fontWhiteBold;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      };

      for (let d = 1; d <= daysInMonth; d++) {
        const startCol = 3 + (d - 1) * 5;
        const endCol = startCol + 4;
        const dayDate = new Date(year, month - 1, d);
        const dayOfWeek = dayDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const fill = isWeekend ? headerFillWeekend : headerFillNormal;

        // Dòng 1: Ngày
        sheet.getCell(1, startCol).value = format(dayDate, 'dd/MM/yyyy');
        sheet.mergeCells(1, startCol, 1, endCol);
        styleCell(1, startCol, fill);

        // Dòng 2: Thứ
        sheet.getCell(2, startCol).value = weekdayNames[dayOfWeek];
        sheet.mergeCells(2, startCol, 2, endCol);
        styleCell(2, startCol, fill);

        // Dòng 3: Columns
        const subHeaders = ['In', 'Out', 'Trễ', 'Sớm', 'Quét'];
        for (let i = 0; i < 5; i++) {
          sheet.getCell(3, startCol + i).value = subHeaders[i];
          styleCell(3, startCol + i, fill);
          sheet.getColumn(startCol + i).width = 8;
        }
      }

      const totalCol = 2 + daysInMonth * 5;

      // Style A1 and B1
      styleCell(1, 1, headerFillNormal);
      styleCell(1, 2, headerFillNormal);

      // Populate Data
      let currentRow = 4;
      const sortedUsers = Array.from(groupedByUsers.values()).sort((a, b) => a.name.localeCompare(b.name));

      for (const u of sortedUsers) {
        sheet.getCell(currentRow, 1).value = u.userId;
        sheet.getCell(currentRow, 2).value = u.name;

        for (let d = 1; d <= daysInMonth; d++) {
          const dayDate = new Date(year, month - 1, d);
          const dateStr = format(dayDate, 'yyyy-MM-dd');
          const startCol = 3 + (d - 1) * 5;
          
          const dayData = u.days[dateStr];
          if (dayData) {
            sheet.getCell(currentRow, startCol).value = dayData.checkIn;
            sheet.getCell(currentRow, startCol + 1).value = dayData.checkOut;
            sheet.getCell(currentRow, startCol + 2).value = dayData.lateMinutes || '';
            sheet.getCell(currentRow, startCol + 3).value = dayData.earlyLeaveMinutes || '';
            sheet.getCell(currentRow, startCol + 4).value = dayData.totalPunches || '';
          }
        }
        
        currentRow++;
      }

      // Add borders and alignment to all data cells
      for (let r = 1; r < currentRow; r++) {
        for (let c = 1; c <= totalCol; c++) {
          const cell = sheet.getCell(r, c);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
          };
          if (r >= 4) {
             cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        }
      }

      // Freeze top 3 rows and first 2 columns
      sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as unknown as Buffer;

    } catch (error: any) {
      this.logger.error('Error fetching data from ZKTeco', error);
      if (zkInstance) {
        try { await zkInstance.disconnect(); } catch (e) {}
      }
      const errMsg = error.err?.message || error.message || error;
      throw new Error(`Lỗi khi kết nối hoặc xử lý dữ liệu từ máy chấm công: ${errMsg}`);
    }
  }

  async getAllAttendances(ip: string, commKey: number = 0, month?: number, year?: number): Promise<any[]> {
    let zkInstance: any;
    try {
      zkInstance = await this.connectToDevice(ip, commKey);
      const usersData = await zkInstance.getUsers();
      const logsData = await zkInstance.getAttendances();
      await zkInstance.disconnect();

      const usersMap = new Map<string, string>();
      if (usersData && usersData.data) {
        usersData.data.forEach((u: any) => {
          const uid = (u.userId ?? u.userid ?? u.uid ?? '').toString();
          if (uid) usersMap.set(uid, u.name || `User ${uid}`);
        });
      }

      let logs = logsData?.data || [];

      // If month and year are provided, filter raw logs first to optimize
      if (month && year) {
        const targetMonthStart = new Date(year, month - 1, 1);
        const targetMonthEnd = endOfMonth(targetMonthStart);
        logs = logs.filter((log: any) => {
          const timeStr = log.recordTime || log.time || log.timestamp;
          if (!timeStr) return false;
          const recordDate = new Date(timeStr);
          if (isNaN(recordDate.getTime())) return false;
          return isWithinInterval(recordDate, { start: targetMonthStart, end: targetMonthEnd });
        });
      }

      let processedRows = processAttendanceData(logs, usersMap);

      // Final sort by date then userId
      processedRows.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date); // Descending date
        if (dateCompare !== 0) return dateCompare;
        return a.userId.localeCompare(b.userId);
      });

      return processedRows;
    } catch (error: any) {
      if (zkInstance) try { await zkInstance.disconnect(); } catch (e) {}
      throw new Error(`Lỗi khi lấy toàn bộ chấm công: ${error.message || error}`);
    }
  }

  private async connectToDevice(ip: string, commKey: number = 0): Promise<any> {
    const zkInstance = new ZKLib(ip, 4370, 10000, 4000);
    let connectResponseCmd: number = 0;
    if (zkInstance.jtcp) {
      zkInstance.jtcp.connect = function() {
        return new Promise(async (resolve, reject) => {
          try {
            const { COMMANDS } = require('zkh-lib/src/command');
            const reply = await this.executeCmd(COMMANDS.CMD_CONNECT, '');
            if (reply) {
              connectResponseCmd = reply.readUInt16LE(0);
              resolve(true);
            } else {
              reject(new Error('NO_REPLY_ON_CMD_CONNECT'));
            }
          } catch (err) {
            reject(err);
          }
        });
      };
    }

    await zkInstance.createSocket();
    patchZKInstance(zkInstance);

    const { COMMANDS } = require('zkh-lib/src/command');
    if (connectResponseCmd === COMMANDS.CMD_ACK_UNAUTH || commKey !== 0) {
      const authKey = makeCommKey(commKey, zkInstance.jtcp.sessionId);
      const authReply = await zkInstance.jtcp.executeCmd(COMMANDS.CMD_AUTH, authKey);
      const authCmdId = authReply.readUInt16LE(0);
      
      if (authCmdId !== COMMANDS.CMD_ACK_OK) {
        throw new Error(`Authentication failed. Code: ${authCmdId}`);
      }
    }
    return zkInstance;
  }

  async getUsersList(ip: string, commKey: number = 0, page: number = 1, limit: number = 10, searchName?: string): Promise<any> {
    let zkInstance: any;
    try {
      zkInstance = await this.connectToDevice(ip, commKey);
      const usersData = await zkInstance.getUsers();
      await zkInstance.disconnect();

      let users = usersData?.data || [];

      if (searchName) {
        const lowerSearch = searchName.toLowerCase();
        users = users.filter((u: any) => u.name && u.name.toLowerCase().includes(lowerSearch));
      }

      const total = users.length;
      const startIndex = (page - 1) * limit;
      const paginatedUsers = users.slice(startIndex, startIndex + limit);

      return {
        data: paginatedUsers.map((u: any) => ({
          id: u.uid,
          userId: u.userId ?? u.userid ?? u.uid,
          role: u.role,
          name: u.name,
          password: u.password
        })),
        total,
        page,
        limit
      };
    } catch (error: any) {
      if (zkInstance) try { await zkInstance.disconnect(); } catch (e) {}
      throw new Error('Đăng nhập thất bại');
    }
  }

  async getUserByUserId(ip: string, commKey: number = 0, userId: string): Promise<any> {
    let zkInstance: any;
    try {
      zkInstance = await this.connectToDevice(ip, commKey);
      const usersData = await zkInstance.getUsers();
      await zkInstance.disconnect();

      const users = usersData?.data || [];
      const user = users.find((u: any) => (u.userId ?? u.userid ?? u.uid)?.toString() === userId.toString());

      if (!user) return null;

      return {
        id: user.uid,
        userId: user.userId ?? user.userid ?? user.uid,
        role: user.role,
        name: user.name,
        password: user.password
      };
    } catch (error: any) {
      if (zkInstance) try { await zkInstance.disconnect(); } catch (e) {}
      throw new Error(`Lỗi khi tìm user: ${error.message || error}`);
    }
  }

  async getAttendanceByUserId(ip: string, commKey: number = 0, userId: string, day?: number, month?: number, year?: number): Promise<any> {
    let zkInstance: any;
    try {
      zkInstance = await this.connectToDevice(ip, commKey);
      const usersData = await zkInstance.getUsers();
      const logsData = await zkInstance.getAttendances();
      await zkInstance.disconnect();

      const usersMap = new Map<string, string>();
      if (usersData && usersData.data) {
        usersData.data.forEach((u: any) => {
          const uid = (u.userId ?? u.userid ?? u.uid ?? '').toString();
          if (uid) usersMap.set(uid, u.name || `User ${uid}`);
        });
      }

      let logs = logsData?.data || [];

      // Filter by userId
      logs = logs.filter((log: any) => {
        if (log.deviceUserId === undefined || log.deviceUserId === null) return false;
        return log.deviceUserId.toString() === userId.toString();
      });

      // Process all logs for this user
      let processedRows = processAttendanceData(logs, usersMap);

      // Filter processed records by day, month, year
      if (day || month || year) {
        processedRows = processedRows.filter(row => {
          const rowDate = parseISO(row.date); // row.date is 'yyyy-MM-dd' from processAttendanceData
          let match = true;
          if (year && rowDate.getFullYear() !== year) match = false;
          // getMonth() is 0-indexed
          if (month && (rowDate.getMonth() + 1) !== month) match = false;
          if (day && rowDate.getDate() !== day) match = false;
          return match;
        });
      }

      // Sort chronological
      processedRows.sort((a, b) => a.date.localeCompare(b.date));

      return {
        userId,
        name: usersMap.get(userId.toString()) || `User ${userId}`,
        attendances: processedRows
      };
    } catch (error: any) {
      if (zkInstance) try { await zkInstance.disconnect(); } catch (e) {}
      throw new Error(`Lỗi khi lấy chấm công user: ${error.message || error}`);
    }
  }
}
