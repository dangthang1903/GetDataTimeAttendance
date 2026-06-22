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

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  async exportAttendanceReport(ip: string, month: number, year: number, commKey: number = 0): Promise<Buffer> {
    let zkInstance: any;
    try {
      this.logger.log(`Connecting to ZKTeco device at ${ip}...`);
      // parameters: ip, port, timeout, inport
      zkInstance = new ZKLib(ip, 4370, 10000, 4000);

      // Capture connect response to know if unauthenticated (2005)
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
      this.logger.log('Connected to ZKTeco successfully.');

      // Patch the ZK instance immediately to avoid unhandled TypeError crash on socket timeouts
      patchZKInstance(zkInstance);

      // Authenticate if requested or required
      const { COMMANDS } = require('zkh-lib/src/command');
      if (connectResponseCmd === COMMANDS.CMD_ACK_UNAUTH || commKey !== 0) {
        this.logger.log(`Device requires authentication (connect code: ${connectResponseCmd}). Sending CMD_AUTH...`);
        const authKey = makeCommKey(commKey, zkInstance.jtcp.sessionId);
        const authReply = await zkInstance.jtcp.executeCmd(COMMANDS.CMD_AUTH, authKey);
        const authCmdId = authReply.readUInt16LE(0);
        
        if (authCmdId === COMMANDS.CMD_ACK_OK) {
          this.logger.log('Authenticated successfully with ZKTeco device.');
        } else {
          throw new Error(`Authentication failed with ZKTeco device. Code: ${authCmdId}`);
        }
      }

      // 1. Fetch Users from device
      this.logger.log('Fetching users from device...');
      const usersData = await zkInstance.getUsers();
      const usersMap = new Map<string, string>();
      if (usersData && usersData.data) {
        usersData.data.forEach((u: any) => {
          // zkh-lib returns 'userId' (camelCase). Guard against undefined.
          const uid = (u.userId ?? u.userid ?? u.uid ?? '').toString();
          if (uid) usersMap.set(uid, u.name || `User ${uid}`);
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
        // Guard against undefined deviceUserId
        if (log.deviceUserId === undefined || log.deviceUserId === null) return;
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
      const errMsg = error.err?.message || error.message || error;
      throw new Error(`Lỗi khi kết nối hoặc xử lý dữ liệu từ máy chấm công: ${errMsg}`);
    }
  }

  async getRawAttendanceData(ip: string, commKey: number = 0, month?: number, year?: number): Promise<any> {
    let zkInstance: any;
    try {
      this.logger.log(`Connecting to ZKTeco device at ${ip} for raw data...`);
      zkInstance = new ZKLib(ip, 4370, 10000, 4000);

      // Capture connect response to know if unauthenticated (2005)
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
      this.logger.log('Connected to ZKTeco successfully for raw data.');

      patchZKInstance(zkInstance);

      const { COMMANDS } = require('zkh-lib/src/command');
      if (connectResponseCmd === COMMANDS.CMD_ACK_UNAUTH || commKey !== 0) {
        this.logger.log(`Device requires authentication. Sending CMD_AUTH...`);
        const authKey = makeCommKey(commKey, zkInstance.jtcp.sessionId);
        const authReply = await zkInstance.jtcp.executeCmd(COMMANDS.CMD_AUTH, authKey);
        const authCmdId = authReply.readUInt16LE(0);
        
        if (authCmdId !== COMMANDS.CMD_ACK_OK) {
          throw new Error(`Authentication failed with ZKTeco device. Code: ${authCmdId}`);
        }
      }

      this.logger.log('Fetching users and logs...');
      const usersData = await zkInstance.getUsers();
      const logsData = await zkInstance.getAttendances();

      await zkInstance.disconnect();

      let logs = logsData?.data || [];

      // Filter if month and year are provided
      if (month && year) {
        const targetMonthStart = new Date(year, month - 1, 1);
        const targetMonthEnd = endOfMonth(targetMonthStart);

        logs = logs.filter((log: any) => {
          const recordDate = typeof log.recordTime === 'string' ? parseISO(log.recordTime) : new Date(log.recordTime);
          return isWithinInterval(recordDate, { start: targetMonthStart, end: targetMonthEnd });
        });
      }

      return {
        users: usersData?.data || [],
        logs: logs
      };
    } catch (error: any) {
      this.logger.error('Error fetching raw data from ZKTeco', error);
      if (zkInstance) {
        try { await zkInstance.disconnect(); } catch (e) {}
      }
      const errMsg = error.err?.message || error.message || error;
      throw new Error(`Lỗi khi lấy JSON từ máy chấm công: ${errMsg}`);
    }
  }
}
