import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Subject } from 'rxjs';

const execAsync = promisify(exec);

@Injectable()
export class NetworkService implements OnApplicationShutdown {
  private readonly logger = new Logger(NetworkService.name);
  
  // Track the interface we modified so we can revert it
  private modifiedInterface: string | null = null;
  
  // Subject for Server-Sent Events (SSE) to notify frontend of disconnection
  public networkStatus$ = new Subject<{ event: string; data: any }>();

  constructor() {
    this.startConnectionMonitor();
    
    // Đảm bảo chắc chắn 100% trả IP về DHCP kể cả khi tắt ngang app (force close)
    process.on('exit', () => {
      if (this.modifiedInterface) {
        try {
          require('child_process').execSync(`netsh interface ip set address name="${this.modifiedInterface}" dhcp`);
        } catch (e) {}
      }
    });
  }

  async onApplicationShutdown(signal?: string) {
    if (this.modifiedInterface) {
      this.logger.log('Ứng dụng đang tắt, tự động trả IP về DHCP...');
      await this.configureDhcp(this.modifiedInterface);
    }
  }

  // Calculate the IP for PC based on Target IP (change last octet to 100)
  calculatePcIp(targetIp: string): string {
    const parts = targetIp.split('.');
    if (parts.length !== 4) throw new Error('Invalid Target IP format');
    parts[3] = '100';
    return parts.join('.');
  }

  // Find the first Connected Ethernet interface
  async getActiveEthernetInterfaceName(): Promise<string> {
    try {
      const { stdout } = await execAsync('netsh interface show interface');
      // Output format:
      // Admin State    State          Type             Interface Name
      // -------------------------------------------------------------------------
      // Enabled        Connected      Dedicated        Ethernet
      
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('Connected') && line.toLowerCase().includes('ethernet')) {
          // Extract the interface name (usually the last column)
          // E.g., "Enabled        Connected      Dedicated        Ethernet 2"
          const match = line.match(/Dedicated\s+(.*)/i);
          if (match && match[1]) {
            return match[1].trim();
          }
        }
      }
      throw new Error('Không tìm thấy cổng mạng Ethernet nào đang được cắm dây (Connected).');
    } catch (error: any) {
      this.logger.error('Error getting interfaces', error);
      throw new Error('Không thể dò tìm cổng mạng: ' + error.message);
    }
  }

  async configureStaticIp(interfaceName: string, ip: string): Promise<void> {
    try {
      this.logger.log(`Configuring ${interfaceName} to static IP ${ip}`);
      await execAsync(`netsh interface ip set address name="${interfaceName}" static ${ip} 255.255.255.0`);
      this.modifiedInterface = interfaceName;
      // Wait a few seconds for Windows to apply
      await new Promise(r => setTimeout(r, 3000));
    } catch (error: any) {
      this.logger.error(`Error setting static IP`, error);
      throw new Error('Không thể cấu hình IP. Vui lòng đảm bảo ứng dụng đang chạy dưới quyền Administrator.');
    }
  }

  async configureDhcp(interfaceName: string): Promise<void> {
    try {
      this.logger.log(`Restoring ${interfaceName} to DHCP`);
      await execAsync(`netsh interface ip set address name="${interfaceName}" dhcp`);
      if (this.modifiedInterface === interfaceName) {
        this.modifiedInterface = null;
      }
    } catch (error: any) {
      this.logger.error(`Error restoring DHCP`, error);
    }
  }

  async ping(ip: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`ping -n 1 -w 2000 ${ip}`);
      if (stdout.includes('TTL=')) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async autoConfig(targetIp: string): Promise<{ success: boolean; message: string }> {
    try {
      const interfaceName = await this.getActiveEthernetInterfaceName();
      const pcIp = this.calculatePcIp(targetIp);
      
      await this.configureStaticIp(interfaceName, pcIp);
      
      // Retry ping up to 8 times (sometimes Windows takes a few seconds to apply network settings)
      let isPingOk = false;
      for (let i = 0; i < 8; i++) {
        isPingOk = await this.ping(targetIp);
        if (isPingOk) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!isPingOk) {
        throw new Error(`Đã cấu hình IP xong nhưng không thể Ping thấy thiết bị tại ${targetIp}. Vui lòng kiểm tra lại cáp.`);
      }

      return { success: true, message: 'Cấu hình mạng và kết nối thành công.' };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  // Monitor for disconnection every 5 seconds
  private startConnectionMonitor() {
    setInterval(async () => {
      if (!this.modifiedInterface) return;

      try {
        const { stdout } = await execAsync('netsh interface show interface');
        const lines = stdout.split('\n');
        
        let isDisconnected = false;
        for (const line of lines) {
          if (line.includes(this.modifiedInterface) && line.includes('Disconnected')) {
            isDisconnected = true;
            break;
          }
        }

        if (isDisconnected) {
          this.logger.warn(`Interface ${this.modifiedInterface} was disconnected! Restoring DHCP...`);
          const iface = this.modifiedInterface;
          this.modifiedInterface = null; // Prevent loop
          
          await this.configureDhcp(iface);
          
          // Notify Frontend
          this.networkStatus$.next({
            event: 'disconnect',
            data: { message: 'Đã rút cáp mạng vật lý.' }
          });
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }, 5000);
  }
}
