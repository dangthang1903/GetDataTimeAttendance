import { useState } from 'react';
import Login from './components/Login';
import { PowerOff } from 'lucide-react';
import Dashboard from './components/Dashboard';

export type DeviceConfig = {
  ip: string;
  commKey: string;
};

function App() {
  const [device, setDevice] = useState<DeviceConfig | null>(null);


  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm z-10 relative">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
              Quản lý máy chấm công
            </h1>
          </div>
          {device && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                Đã kết nối: {device.ip}
              </div>
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
              >
                <PowerOff className="w-4 h-4" />
                Ngắt kết nối
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col relative">
        {/* Background Decorative */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-white -z-10"></div>

        {device ? (
          <Dashboard device={device} />
        ) : (
          <Login onConnect={setDevice} />
        )}
      </main>

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <PowerOff className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Xác nhận ngắt kết nối</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Bạn có chắc chắn muốn ngắt kết nối với máy chấm công này không? Bạn sẽ phải nhập lại IP để kết nối lại.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium rounded-lg transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  setDevice(null);
                  setShowDisconnectConfirm(false);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-medium rounded-lg shadow-sm transition-colors"
              >
                Đồng ý ngắt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
