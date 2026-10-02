/* Daily Ten — 日期工具（本地時間 YYYY-MM-DD）。M1 自 index.html 原樣搬出。 */
/* ================= DATE HELPERS ================= */
export function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
export function dateOffset(base,days){const d=new Date(base+'T00:00:00');d.setDate(d.getDate()+days);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
export function dayGap(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);}
export function isoWeek(d){const t=new Date(d.valueOf());t.setDate(t.getDate()+3-((t.getDay()+6)%7));
  const w1=new Date(t.getFullYear(),0,4);return 1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);}
