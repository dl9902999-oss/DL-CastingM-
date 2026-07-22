import SyncHistoryPanel from '../components/SyncHistoryPanel';
import { useDataConnection } from '../contexts/DataContext';
import { Wifi, WifiOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SyncHistory() {
  const { isOnline, connectionReason } = useDataConnection();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-100">同步歷史紀錄</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              查看每次資料同步的狀態與結果
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-400">線上</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-400">離線</span>
                {connectionReason !== 'none' && (
                  <span className="text-xs text-zinc-500 ml-1">({connectionReason})</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sync History Panel */}
        <SyncHistoryPanel />
      </div>
    </div>
  );
}