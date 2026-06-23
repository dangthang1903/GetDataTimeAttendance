import React, { useState } from 'react';
import type { DeviceConfig } from '../App';
import { Server, KeyRound, Loader2, ArrowRight, Cable } from 'lucide-react';
import axios from 'axios';

type LoginProps = {
  onConnect: (device: DeviceConfig) => void;
};

export default function Login({ onConnect }: LoginProps) {
  const [ip, setIp] = useState('192.168.1.200');
  const [commKey, setCommKey] = useState('0');
  const [loading, setLoading] = useState(false);
  const [autoConfiguring, setAutoConfiguring] = useState(false);
  const [autoStatus, setAutoStatus] = useState('');
  const [error, setError] = useState('');

  const connectDevice = async (targetIp: string, targetCommKey: string) => {
    setLoading(true);
    setError('');
    
    try {
      await axios.get('/attendance/users', {
        params: { ip: targetIp, commKey: targetCommKey, page: 1, limit: 1 }
      });
      onConnect({ ip: targetIp, commKey: targetCommKey });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể kết nối đến thiết bị. Vui lòng kiểm tra lại IP hoặc CommKey.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip) return;
    connectDevice(ip, commKey);
  };

  const handleAutoConnect = async () => {
    if (!ip) return;
    setAutoConfiguring(true);
    setError('');
    setAutoStatus('Đang dò tìm card mạng và cấu hình IP tĩnh...');

    try {
      await axios.post('/network/auto-config', { targetIp: ip });
      setAutoStatus('Đã thông mạng! Đang kết nối thiết bị...');
      await connectDevice(ip, commKey);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi cấu hình tự động. Hãy đảm bảo bạn cắm dây mạng trực tiếp và chạy phần mềm bằng quyền Admin.');
    } finally {
      setAutoConfiguring(false);
      setAutoStatus('');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 border border-white p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Server className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Kết nối Máy Chấm Công</h2>
            <p className="text-slate-500 mt-2 text-sm">Nhập thông số thiết bị ZKTeco để đồng bộ dữ liệu</p>
          </div>

          <form onSubmit={handleConnect} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Địa chỉ IP
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Server className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white/50 backdrop-blur-sm transition-all"
                  placeholder="Ví dụ: 192.168.1.200"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Comm Key (Mật mã kết nối)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={commKey}
                  onChange={(e) => setCommKey(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white/50 backdrop-blur-sm transition-all"
                  placeholder="Thường là 0"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}
            
            {autoStatus && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700 flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {autoStatus}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleAutoConnect}
                disabled={loading || autoConfiguring}
                className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              >
                {autoConfiguring ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Đang thiết lập Plug & Play...
                  </>
                ) : (
                  <>
                    <Cable className="w-5 h-5 mr-2" />
                    Cắm Dây & Tự Động Kết Nối
                  </>
                )}
              </button>
              
              <button
                type="submit"
                disabled={loading || autoConfiguring}
                className="w-full flex items-center justify-center py-3 px-4 border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              >
                {loading && !autoConfiguring ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin text-slate-400" />
                    Đang kết nối...
                  </>
                ) : (
                  <>
                    Kết nối bằng tay (Đã chỉnh IP)
                    <ArrowRight className="w-5 h-5 ml-2 text-slate-400" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
        
        <p className="text-center text-sm text-slate-400 mt-6">
          Phần mềm quản lý nhân sự chuyên nghiệp
        </p>
      </div>
    </div>
  );
}
