import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardStats, getWorkOrders, getMoldingBatches, getShipmentOrders } from '@/lib/store';
import { Activity, TrendingUp, Package, Truck } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

export default function Dashboard() {
  const [stats, setStats] = useState({ todayProduction: 0, yieldRate: 0, wipQuantity: 0, pendingShipment: 0 });
  const [recentOrders, setRecentOrders] = useState<{ order_no: string; customer: string; status: string }[]>([]);

  useEffect(() => {
    setStats(getDashboardStats());
    const orders = getWorkOrders().slice(-5).reverse();
    setRecentOrders(orders.map(o => ({ order_no: o.order_no, customer: o.customer, status: o.status })));
  }, []);

  const statCards = [
    { title: '今日產量', value: stats.todayProduction, unit: '件', icon: <Activity className="w-5 h-5" />, color: 'text-blue-400' },
    { title: '良率', value: `${stats.yieldRate}%`, unit: '', icon: <TrendingUp className="w-5 h-5" />, color: 'text-green-400' },
    { title: '在製量', value: stats.wipQuantity, unit: '件', icon: <Package className="w-5 h-5" />, color: 'text-amber-400' },
    { title: '待出貨', value: stats.pendingShipment, unit: '單', icon: <Truck className="w-5 h-5" />, color: 'text-purple-400' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-100">儀表板</h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(card => (
            <Card key={card.title} className="bg-zinc-800 border-zinc-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={card.color}>{card.icon}</span>
                </div>
                <p className="text-2xl font-bold text-zinc-100">
                  {card.value}{card.unit && <span className="text-sm text-zinc-400 ml-1">{card.unit}</span>}
                </p>
                <p className="text-xs text-zinc-400 mt-1">{card.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Work Orders */}
        <Card className="bg-zinc-800 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-lg">最近工單</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-zinc-400 text-sm">尚無工單資料</p>
            ) : (
              <div className="space-y-2">
                {recentOrders.map(order => (
                  <div key={order.order_no} className="flex items-center justify-between p-3 rounded-md bg-zinc-700/50">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{order.order_no}</p>
                      <p className="text-xs text-zinc-400">{order.customer}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      order.status === 'Open' ? 'bg-blue-500/20 text-blue-400' :
                      order.status === 'In Progress' ? 'bg-amber-500/20 text-amber-400' :
                      order.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                      'bg-zinc-600 text-zinc-300'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-zinc-100 text-lg">生產概況</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">總工單數</span>
                  <span className="text-zinc-200">{getWorkOrders().length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">進行中批次</span>
                  <span className="text-zinc-200">{getMoldingBatches().filter(b => b.status !== 'Completed').length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">待出貨訂單</span>
                  <span className="text-zinc-200">{getShipmentOrders().filter(s => s.status === 'Pending').length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-800 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-zinc-100 text-lg">系統狀態</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <span className="text-sm text-zinc-300">系統運行正常</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <span className="text-sm text-zinc-300">離線模式（Demo）</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}