// JavaScript port of ReportSimple's deterministic range verification layer.
// Rule output, not an LLM label, determines high/low/normal. OCR-suspect values remain unclear.
const FALLBACK = [
  [['hemoglobin','haemoglobin'],[12.0,17.0]], [['wbc','white blood'],[4000,11000]],
  [['platelet'],[150000,410000]], [['fasting blood sugar','fasting glucose','blood sugar'],[70,100]],
  [['hba1c'],[4.0,5.6]], [['total cholesterol'],[null,200]], [['ldl'],[null,100]],
  [['hdl'],[40,null]], [['creatinine'],[0.7,1.3]], [['vitamin d'],[30,100]]
];
export function toNumber(value){const m=String(value??'').match(/-?\d[\d,]*\.?\d*/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null;}
export function parseRange(value){
  const s=String(value??'').replace(/,/g,'');
  let m=s.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);if(m)return [Number(m[1]),Number(m[2])];
  m=s.match(/[<≤]=?\s*(\d+\.?\d*)/);if(m)return [null,Number(m[1])];
  m=s.match(/[>≥]=?\s*(\d+\.?\d*)/);if(m)return [Number(m[1]),null];
  return null;
}
function fallback(name){const n=String(name||'').toLowerCase();for(const [keys,range] of FALLBACK)if(keys.some(k=>n.includes(k)))return range;return null;}
function rangeStatus(value,low,high){if(low!==null&&value<low)return 'low';if(high!==null&&value>high)return 'high';return 'normal';}
export function verifyFindings(input=[]){
  const stats={total:0,verified:0,corrected:0,unchecked:0,ocrSuspect:0};
  const findings=(Array.isArray(input)?input:[]).slice(0,100).map(raw=>{
    const f=raw||{},name=String(f.name||'Unknown test').slice(0,120),value=String(f.value??'').slice(0,60),unit=String(f.unit||'').slice(0,40),normalRange=String(f.normal_range??f.normalRange??'').slice(0,80);
    const numeric=toNumber(value),range=parseRange(normalRange)||fallback(name);let status='unclear',check='Not auto-verified: numeric value or reference range is unavailable.';
    if(numeric!==null&&range){
      status=rangeStatus(numeric,range[0],range[1]);check=normalRange?'Verified against the reference range printed on the report.':'Compared with a generic adult fallback range; patient- and laboratory-specific ranges may differ.';
      const hasDecimalBounds=range.some(bound=>bound!==null&&!Number.isInteger(bound));
      if(status!=='normal'&&hasDecimalBounds&&Number.isInteger(numeric)&&rangeStatus(numeric/10,range[0],range[1])==='normal'){
        status='unclear';check+=` Possible OCR decimal loss: value may have been ${numeric/10}; check the original report.`;stats.ocrSuspect++;stats.unchecked++;
      }else stats.verified++;
      if(f.status&&f.status!==status)stats.corrected++;
    }else stats.unchecked++;
    return {name,value,unit,normalRange,status,check};
  });
  stats.total=findings.length;
  return {findings,stats};
}
export function urgency(findings){return findings.some(x=>x.status==='high'||x.status==='low')?'review_soon':'routine';}
