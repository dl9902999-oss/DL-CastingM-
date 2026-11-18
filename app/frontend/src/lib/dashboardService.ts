import { readCloudPourings } from './pouringService';
import * as service from './dataService';
import { supabase } from './supabase';
import { calculateOverview, latestRecordTime } from './dashboardOverview';

export async function loadDashboardOverview() {
  const [orders, batches, meltings, melts, materials, cloudPourings, inspections, defects, capas, warehouse, shipments] = await Promise.all([
    service.dsGetWorkOrders(), service.dsGetMoldingBatches(), service.dsGetMeltingRecords(),
    service.dsGetMeltRecords(), service.dsGetMeltMaterials(), readCloudPourings(),
    service.dsGetQualityInspections(), service.dsGetDefectRecords(), service.dsGetCAPARecords(),
    service.dsGetWarehouseEntries(), service.dsGetShipmentOrders(),
  ]);
  const pourings = cloudPourings;
  const data = { orders, batches, meltings, melts, materials, pourings, inspections, defects, capas, warehouse, shipments };
  let lastUpdated = localStorage.getItem('foundry_dashboard_last_update') || latestRecordTime(Object.values(data));
  let updateTimeUnavailable = false;
  if (await service.isSupabaseConnected()) {
    const { data: state, error } = await supabase.from('dashboard_data_state').select('last_updated_at').eq('id', 1).single();
    if (error) updateTimeUnavailable = true;
    else {
      lastUpdated = state.last_updated_at;
      if (lastUpdated) localStorage.setItem('foundry_dashboard_last_update', lastUpdated);
    }
  }
  return { ...calculateOverview(data), lastUpdated, updateTimeUnavailable };
}
