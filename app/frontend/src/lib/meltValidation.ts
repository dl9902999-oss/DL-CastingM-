export const furnaceFromNumber = (value: string) => Number(value.match(/^([1-3])-[1-9]\d*$/)?.[1] || 0);
export function validateMeltInput(record: {melt_date:string;furnace_no:string;power_start_time:string;tap_time:string;power_kwh:number;tap_temp:number;residual_weight:number}, body:number,
 materials:{raw_material:string;charge_weight:number;secondary_weight:number}[], chemistry:Record<string,Record<string,number>>, ranges:Record<string,number>) {
 const errors:string[]=[]; const warnings:string[]=[];
 const finiteNonnegative=(n:number)=>Number.isFinite(n)&&n>=0;
 if (!/^\d{4}-\d{2}-\d{2}$/.test(record.melt_date) || !Number.isFinite(Date.parse(record.melt_date))) errors.push('請填寫有效熔解日期');
 if (!furnaceFromNumber(record.furnace_no) || furnaceFromNumber(record.furnace_no)!==body) errors.push('爐號與爐體不一致，請重新選擇爐號');
 const time=/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
 if (!time.test(record.power_start_time)||!time.test(record.tap_time)) errors.push('開始送電與出湯時間皆為必填');
 else if(record.power_start_time.slice(0,5)===record.tap_time.slice(0,5)) errors.push('開始送電與出湯時間不可相同');
 for(const [name,value] of [['耗電',record.power_kwh],['出爐溫度',record.tap_temp],['本爐殘湯',record.residual_weight]] as const) if(!finiteNonnegative(value)) errors.push(`${name}必須是大於或等於零的有效數值`);
 if(materials.some(m=>!m.raw_material.trim()||!finiteNonnegative(m.charge_weight)||!finiteNonnegative(m.secondary_weight))) errors.push('投料原料不可空白，重量須為大於或等於零的有效數值');
 for(const [stage,row] of Object.entries(chemistry)) {
   const values=Object.values(row);
   if(values.some(v=>!finiteNonnegative(v)||v>100)) errors.push(`${stage==='IN_FURNACE'?'爐中':'爐後'}成分須介於 0～100%`);
   if(values.reduce((a,b)=>a+b,0)>100.001) errors.push(`${stage==='IN_FURNACE'?'爐中':'爐後'}成分合計不可超過 100%`);
 }
 for(const [key,value] of Object.entries(ranges)) {
   if(!finiteNonnegative(value)||value>100) errors.push('目標成分須介於 0～100%');
   if(key.endsWith('_min') && (ranges[key.replace('_min','_max')]||0)>0 && value>ranges[key.replace('_min','_max')]) errors.push('目標成分下限不可高於上限');
 }
 const total=materials.reduce((sum,m)=>sum+m.charge_weight+m.secondary_weight,0);
 if(record.residual_weight>total) warnings.push(`本爐殘湯 ${record.residual_weight} kg 超過投料總重 ${total} kg`);
 return {errors:[...new Set(errors)],warnings};
}
