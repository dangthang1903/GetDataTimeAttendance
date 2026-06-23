import { Controller, Post, Body, HttpException, HttpStatus, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NetworkService } from './network.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@ApiTags('Network')
@Controller('network')
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Post('auto-config')
  @ApiOperation({ summary: 'Tự động cấu hình IP và kiểm tra kết nối thiết bị' })
  async autoConfig(@Body('targetIp') targetIp: string) {
    if (!targetIp) {
      throw new HttpException('Thiếu tham số targetIp', HttpStatus.BAD_REQUEST);
    }
    
    try {
      const result = await this.networkService.autoConfig(targetIp);
      return result;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('restore')
  @ApiOperation({ summary: 'Khôi phục cấu hình IP về DHCP' })
  async restoreConfig() {
    try {
      // Re-use onApplicationShutdown to trigger restore logic
      await this.networkService.onApplicationShutdown();
      return { success: true, message: 'Đã trả về cấu hình mạng bình thường' };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Sse('status')
  sse(): Observable<MessageEvent> {
    return this.networkService.networkStatus$.asObservable().pipe(
      map((payload) => ({
        data: payload.data,
        type: payload.event,
      }))
    );
  }
}
