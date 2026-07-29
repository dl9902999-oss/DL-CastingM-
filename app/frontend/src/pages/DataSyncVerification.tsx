import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { getConnectionStatus, getPendingSyncCount, attemptReconnect } from '@/lib/dataService';
import AppLayout from '@/components/layout/AppLayout';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, CloudOff, Database, Wifi } from 'lucide-react';

interface TableVerification {
  table: string;
  label: string;
  localCount: number;
  cloudCount: number | null;
  cloudError: string | null;
  synced: boolean;
  checking: boolean;
}

const TABLES_TO_VERIFY = [
  { table: 'work_orders', label: '工單', storageKey: 'foundry_work_orders' },
  { table: 'customers', label: '客戶', storageKey: 'foundry_customers' },
  { table: 'molding_batches', label: '造模批次', storageKey: 'foundry_molding_batches' },
  { table: 'melting_records', label: '熔煉紀錄', storageKey: 'foundry_melting_records' },
  { table: 'quality_inspections', label: '品質檢驗', storageKey: 'foundry_quality_inspections' },
  { table: 'warehouse_entries', label: '入庫紀錄', storageKey: 'foundry_warehouse_entries' },
  { table: 'shipment_orders', label: '出貨紀錄', storageKey: 'foundry_shipment_orders' },
  { table: 'patterns', label: '模具', storageKey: 'foundry_patterns' },
];

export default function DataSyncVerification() {
  const { toast } = useToast();
  const [verifications, setVerifications] = useState<TableVerification[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connectionTest, setConnectionTest] = useState<{
    tested: boolean;
    connected: boolean;
    authOk: boolean;
    selectOk: boolean;
    insertOk: boolean;
    deleteOk: boolean;
    error: string | null;
  } | null>(null);

  const getLocalCount = (storageKey: string): number => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  };

  const verifyAllTables = useCallback(async () => {
    setIsRunning(true);
    const results: TableVerification[] = [];

    for (const { table, label, storageKey } of TABLES_TO_VERIFY) {
      const localCount = getLocalCount(storageKey);
      let cloudCount: number | null = null;
      let cloudError: string | null = null;

      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        if (error) {
          cloudError = error.message;
        } else {
          cloudCount = count;
        }
      } catch (e) {
        cloudError = e instanceof Error ? e.message : '連線失敗';
      }

      results.push({
        table,
        label,
        localCount,
        cloudCount,
        cloudError,
        synced: cloudError === null && cloudCount === localCount,
        checking: false,
      });
    }

    setVerifications(results);
    setIsRunning(false);

    const allSynced = results.every(r => r.synced);
    if (allSynced) {
      toast({ title: '✅ 所有資料表同步正常' });
    } else {
      const outOfSync = results.filter(r => !r.synced);
      toast({
        title: `⚠️ ${outOfSync.length} 個資料表需要注意`,
        description: outOfSync.map(r => r.label).join('、'),
        variant: 'destructive',
      });
    }
  }, [toast]);

  const runConnectionTest = useCallback(async () => {
    setConnectionTest(null);
    const result = {
      tested: true,
      connected: false,
      authOk: false,
      selectOk: false,
      insertOk: false,
      deleteOk: false,
      error: null as string | null,
    };

    try {
      // Test 1: Auth connectivity
      const { error: authErr } = await supabase.auth.getSession();
      if (authErr) {
        result.error = `Auth 失敗: ${authErr.message}`;
        setConnectionTest(result);
        return;
      }
      result.authOk = true;
      result.connected = true;

      // Test 2: SELECT on work_orders
      const { error: selectErr } = await supabase
        .from('work_orders')
        .select('id')
        .limit(1);
      if (selectErr) {
        result.error = `SELECT 失敗: ${selectErr.message}`;
      } else {
        result.selectOk = true;
      }

      // Test 3: INSERT + DELETE test (use a test record)
      const testId = `test-sync-verify-${Date.now()}`;
      const testOrderNo = `TEST-VERIFY-${Date.now()}`;
      const { data: insertData, error: insertErr } = await supabase
        .from('work_orders')
        .insert({
          order_no: testOrderNo,
          customer: '__SYNC_TEST__',
          product_name: '__SYNC_TEST__',
          status: 'Open',
        })
        .select('id')
        .single();

      if (insertErr) {
        result.error = `INSERT 失敗: ${insertErr.message}`;
      } else {
        result.insertOk = true;
        // Test 4: DELETE the test record
        if (insertData?.id) {
          const { error: deleteErr } = await supabase
            .from('work_orders')
            .delete()
            .eq('id', insertData.id);
          if (deleteErr) {
            result.error = `DELETE 失敗: ${deleteErr.message}`;
          } else {
            result.deleteOk = true;
          }
        }
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : '未知錯誤';
    }

    setConnectionTest(result);

    if (result.insertOk && result.deleteOk && result.selectOk) {
      toast({ title: '✅ 連線測試全部通過，INSERT/SELECT/DELETE 均正常' });
    } else {
      toast({
        title: '⚠️ 連線測試有問題',
        description: result.error || '部分操作失敗',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleReconnect = useCallback(async () => {
    const ok = await attemptReconnect();
    if (ok) {
      toast({ title: '✅ 重新連線成功' });
    } else {
      toast({ title: '❌ 重新連線失敗', variant: 'destructive' });
    }
  }, [toast]);

  const status = getConnectionStatus();
  const pendingCount = getPendingSyncCount();

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-100">資料同步驗證</h1>
          <div className="flex gap-2">
            <Button onClick={handleReconnect} variant="outline" size="sm">
              <Wifi className="w-4 h-4 mr-1" />
              重新連線
            </Button>
          </div>
        </div>

        {/* Connection Status Overview */}
        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-zinc-100 flex items-center gap-2">
              <Database className="w-5 h-5" />
              系統狀態
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-sm text-zinc-400">連線狀態</div>
                <Badge variant={status.connected ? 'default' : 'destructive'} className="mt-1">
                  {status.connected ? '已連線' : '離線'}
                </Badge>
              </div>
              <div className="text-center">
                <div className="text-sm text-zinc-400">寫入狀態</div>
                <Badge variant={status.writeFailed ? 'destructive' : 'default'} className="mt-1">
                  {status.writeFailed ? '寫入受阻' : '正常'}
                </Badge>
              </div>
              <div className="text-center">
                <div className="text-sm text-zinc-400">離線原因</div>
                <Badge variant="outline" className="mt-1">
                  {status.reason === 'none' ? '無' : status.reason === 'rls_blocked' ? 'RLS 權限' : status.reason === 'no_connection' ? '無連線' : '錯誤'}
                </Badge>
              </div>
              <div className="text-center">
                <div className="text-sm text-zinc-400">待同步筆數</div>
                <Badge variant={pendingCount > 0 ? 'destructive' : 'default'} className="mt-1">
                  {pendingCount}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Test */}
        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-zinc-100 flex items-center gap-2">
              <Wifi className="w-5 h-5" />
              CRUD 連線測試
              <Button onClick={runConnectionTest} size="sm" variant="outline" className="ml-auto">
                <RefreshCw className="w-4 h-4 mr-1" />
                執行測試
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {connectionTest === null ? (
              <p className="text-zinc-400 text-sm">點擊「執行測試」以驗證 Supabase 的 INSERT / SELECT / DELETE 是否正常運作。</p>
            ) : (
              <div className="space-y-2">
                <TestResultRow label="Auth 連線" ok={connectionTest.authOk} />
                <TestResultRow label="SELECT（讀取）" ok={connectionTest.selectOk} />
                <TestResultRow label="INSERT（新增）" ok={connectionTest.insertOk} />
                <TestResultRow label="DELETE（刪除）" ok={connectionTest.deleteOk} />
                {connectionTest.error && (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
                    <strong>錯誤詳情：</strong> {connectionTest.error}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table Verification */}
        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-zinc-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              各表資料比對
              <Button onClick={verifyAllTables} size="sm" variant="outline" className="ml-auto" disabled={isRunning}>
                <RefreshCw className={`w-4 h-4 mr-1 ${isRunning ? 'animate-spin' : ''}`} />
                {isRunning ? '驗證中...' : '執行比對'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {verifications.length === 0 ? (
              <p className="text-zinc-400 text-sm">點擊「執行比對」以比較本地與雲端各表的資料筆數。</p>
            ) : (
              <div className="space-y-2">
                {verifications.map((v) => (
                  <div key={v.table} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      {v.synced ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : v.cloudError ? (
                        <XCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{v.label}</div>
                        <div className="text-xs text-zinc-400">{v.table}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-zinc-400 text-xs">本地</div>
                        <div className="text-zinc-100 font-mono">{v.localCount}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-zinc-400 text-xs">雲端</div>
                        <div className={`font-mono ${v.cloudError ? 'text-red-400' : 'text-zinc-100'}`}>
                          {v.cloudError ? (
                            <CloudOff className="w-4 h-4" />
                          ) : (
                            v.cloudCount ?? '-'
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={v.synced ? 'default' : 'destructive'}
                        className="min-w-[60px] justify-center"
                      >
                        {v.synced ? '同步' : v.cloudError ? '錯誤' : '差異'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Sync Details */}
        {pendingCount > 0 && (
          <Card className="bg-zinc-900 border-amber-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                待同步項目 ({pendingCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PendingSyncDetails />
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function TestResultRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-zinc-800 rounded">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-400" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400" />
      )}
      <span className="text-sm text-zinc-200">{label}</span>
      <Badge variant={ok ? 'default' : 'destructive'} className="ml-auto text-xs">
        {ok ? '通過' : '失敗'}
      </Badge>
    </div>
  );
}

function PendingSyncDetails() {
  const raw = localStorage.getItem('foundry_pending_sync');
  if (!raw) return <p className="text-zinc-400 text-sm">無待同步項目</p>;

  try {
    const queue = JSON.parse(raw) as Array<{
      id: string;
      table: string;
      action: string;
      timestamp: number;
      data?: Record<string, unknown>;
    }>;

    if (queue.length === 0) return <p className="text-zinc-400 text-sm">無待同步項目</p>;

    return (
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {queue.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {item.action === 'create' ? '新增' : item.action === 'update' ? '更新' : '刪除'}
              </Badge>
              <span className="text-zinc-300">{item.table}</span>
            </div>
            <span className="text-zinc-500">
              {new Date(item.timestamp).toLocaleString('zh-TW')}
            </span>
          </div>
        ))}
      </div>
    );
  } catch {
    return <p className="text-zinc-400 text-sm">解析失敗</p>;
  }
}