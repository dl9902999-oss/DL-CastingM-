import type {MeltRecord,MeltMaterial,MeltChemistry} from './types';
export function meltWarnings(r:Pick<MeltRecord,'power_kwh'|'tap_temp'|'residual_weight'>,materials:Pick<MeltMaterial,'charge_weight'|'secondary_weight'>[],chem:Pick<MeltChemistry,'sample_stage'>[],limits:{energy:string;residual:string}) {
 const warnings:string[]=[];const total=materials.reduce((sum,m)=>sum+Number(m.charge_weight)+Number(m.secondary_weight),0);
 if(!(r.power_kwh>0))warnings.push('耗電未填或為零');if(!(r.tap_temp>0))warnings.push('出爐溫度未填或為零');
 if(!chem.some(c=>c.sample_stage==='IN_FURNACE'||c.sample_stage==='AFTER_FURNACE'))warnings.push('缺少實測成分');
 if(!(total>0))warnings.push('缺少投料重量');
 if(total>0&&limits.energy!==''&&Number.isFinite(Number(limits.energy))&&Number(limits.energy)>=0&&r.power_kwh/total>Number(limits.energy))warnings.push('能耗超過設定上限');
 if(total>0&&limits.residual!==''&&Number.isFinite(Number(limits.residual))&&Number(limits.residual)>=0&&(r.residual_weight||0)/total*100>Number(limits.residual))warnings.push('當爐殘湯率超過設定上限');
 return warnings;
}
