import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Calendar, Clock, FileSpreadsheet, ChevronLeft, ChevronRight, UserCircle, Loader2 } from 'lucide-react';
import type { DeviceConfig } from '../App';
import { format, parseISO } from 'date-fns';
import useSWR from 'swr';

const fetcher = (url: string) => axios.get(url).then(res => res.data);

type LogData = {
  userId: string;
  name: string;
  date: string;
  checkIn: string;
  checkOut: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workingHours: number;
};

export default function AttendanceLogs({ device }: { device: DeviceConfig }) {
  const [searchName, setSearchName] = useState('');
  
  const [day, setDay] = useState<number | ''>('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Fetch ALL logs for the month
  const { data: allLogs, isLoading } = useSWR<LogData[]>(
    `/attendance/logs?ip=${device.ip}&commKey=${device.commKey}&month=${month}&year=${year}`,
    fetcher,
    {
      revalidateOnFocus: false,
      keepPreviousData: true
    }
  );

  const logs = allLogs || [];

  // Client-side Filter
  const filteredLogs = logs.filter(log => {
    if (day !== '') {
      try {
        const logDay = parseISO(log.date).getDate();
        if (logDay !== day) return false;
      } catch (e) {}
    }
    if (!searchName) return true;
    const s = searchName.toLowerCase();
    return (log.name?.toLowerCase().includes(s) || log.userId?.includes(s));
  });

  const total = filteredLogs.length;
  const totalPages = Math.ceil(total / limit) || 1;
  
  // Client-side Pagination
  const paginatedLogs = filteredLogs.slice((page - 1) * limit, page * limit);

  // If page exceeds total pages after filtering, reset to 1
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [totalPages, page]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/attendance/export', {
        params: { ip: device.ip, commKey: device.commKey, month, year },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bang_Cham_Cong_T${month}_${year}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Có lỗi xảy ra khi xuất file!');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header & Search */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center">
            <UserCircle className="w-5 h-5 mr-2 text-slate-400" />
            Nhật Ký Chấm Công ({total})
          </h3>
          
          <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400 ml-2" />
            <select
              value={day === '' ? '' : day}
              onChange={(e) => { setDay(e.target.value === '' ? '' : Number(e.target.value)); setPage(1); }}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer pr-8"
            >
              <option value="">Tất cả ngày</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>Ngày {d}</option>
              ))}
            </select>
            <div className="w-px h-4 bg-slate-300"></div>
            <select
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer pr-8"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer pr-8"
            >
              {[2023, 2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã hoặc tên..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-sm transition-all"
            />
          </div>
          
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm shadow-emerald-600/20 transition-colors disabled:opacity-70"
          >
            {exporting ? (
              <span className="animate-pulse">Đang xuất file...</span>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Xuất Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider sticky top-0 z-10">
              <th className="px-6 py-4">Ngày</th>
              <th className="px-6 py-4">Mã NV</th>
              <th className="px-6 py-4">Họ Tên</th>
              <th className="px-6 py-4">Giờ Vào (In)</th>
              <th className="px-6 py-4">Giờ Ra (Out)</th>
              <th className="px-6 py-4">Đi Trễ</th>
              <th className="px-6 py-4">Về Sớm</th>
              <th className="px-6 py-4">Tổng giờ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-slate-500 font-medium animate-pulse">Đang đồng bộ dữ liệu chấm công tháng {month}...</p>
                  </div>
                </td>
              </tr>
            ) : paginatedLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-slate-400">Không tìm thấy dữ liệu chấm công nào</td>
              </tr>
            ) : (
              paginatedLogs.map((log, idx) => (
                <tr key={`${log.userId}-${log.date}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-700">{format(parseISO(log.date), 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{log.userId}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-800">{log.name || '(Trống)'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {log.checkIn ? <span className="flex items-center text-emerald-600 font-medium"><Clock className="w-3.5 h-3.5 mr-1.5" />{log.checkIn}</span> : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {log.checkOut ? <span className="flex items-center text-amber-600 font-medium"><Clock className="w-3.5 h-3.5 mr-1.5" />{log.checkOut}</span> : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {log.lateMinutes > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {log.lateMinutes} phút
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {log.earlyLeaveMinutes > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {log.earlyLeaveMinutes} phút
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-700">
                    {log.workingHours > 0 ? `${log.workingHours}h` : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Limit */}
      <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">
            Hiển thị trang <span className="font-semibold text-slate-700">{page}</span> / <span className="font-semibold text-slate-700">{totalPages || 1}</span>
          </span>
          <div className="flex items-center text-sm text-slate-500">
            <span className="mr-2">Số dòng:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || totalPages === 0}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
