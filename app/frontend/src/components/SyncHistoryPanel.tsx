import { useDataConnection } from '../contexts/DataContext';
import type { SyncLogEntry, SyncLogStatus } from '../contexts/DataContext';
import { CheckCircle2, XCircle, AlertTriangle, SkipForward, Clock, Trash2, RefreshCw, Database } from 'lucide-react';

function statusIcon(status: SyncLogStatus) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case 'partial':
      return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-gray-400" />;
  }
}

function statusLabel(status: SyncLogStatus): string {
  switch (status) {
    case 'success': return '成功';
    case 'partial': return '部分失敗';
    case 'failed': return '失敗';
    case 'skipped': return '略過（無待同步）';
  }
}

function triggerLabel(trigger: SyncLogEntry['trigger']): string {
  switch (trigger) {
    case 'auto_recovery': return '自動恢復';
    case 'manual_refresh': return '手動刷新';
    case 'periodic': return '定期同步';
    case 'initial': return '初始同步';
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function SyncHistoryPanel() {
  const { syncHistory, syncStats, clearHistory, refreshData } = useDataConnection();

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-zinc-100">{syncStats.totalSyncs}</div>
          <div className="text-xs text-zinc-400">總同步次數</div>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{syncStats.successfulSyncs}</div>
          <div className="text-xs text-zinc-400">成功次數</div>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{syncStats.failedSyncs}</div>
          <div className="text-xs text-zinc-400">失敗次數</div>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-400">{syncStats.totalItemsSynced}</div>
          <div className="text-xs text-zinc-400">已同步筆數</div>
        </div>
      </div>

      {/* Last sync info */}
      {syncStats.lastSyncTime && (
        <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2">
          <Clock className="h-4 w-4" />
          <span>最後同步：{formatTime(syncStats.lastSyncTime)}</span>
          <span className="ml-2">狀態：{syncStats.lastSyncStatus ? statusLabel(syncStats.lastSyncStatus) : '—'}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => refreshData()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          立即同步
        </button>
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清除歷史
        </button>
      </div>

      {/* History List */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-zinc-800 px-4 py-2 border-b border-zinc-700 flex items-center gap-2">
          <Database className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">同步歷史紀錄</span>
          <span className="text-xs text-zinc-500 ml-auto">最近 {syncHistory.length} 筆</span>
        </div>

        {syncHistory.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm">
            尚無同步紀錄
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-700/50">
            {syncHistory.map((entry) => (
              <div key={entry.id} className="px-4 py-3 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  {statusIcon(entry.status)}
                  <span className="text-sm font-medium text-zinc-200">
                    {statusLabel(entry.status)}
                  </span>
                  <span className="text-xs text-zinc-500 ml-auto">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400 ml-6">
                  <span>觸發：{triggerLabel(entry.trigger)}</span>
                  <span>耗時：{formatDuration(entry.duration)}</span>
                  {entry.totalItems > 0 && (
                    <span>
                      項目：{entry.successCount}/{entry.totalItems} 成功
                      {entry.failedCount > 0 && (
                        <span className="text-red-400 ml-1">({entry.failedCount} 失敗)</span>
                      )}
                    </span>
                  )}
                  {entry.tables.length > 0 && (
                    <span>資料表：{entry.tables.join(', ')}</span>
                  )}
                </div>
                {entry.errorMessage && (
                  <div className="ml-6 mt-1 text-xs text-red-400 bg-red-900/20 rounded px-2 py-1 truncate">
                    錯誤：{entry.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}