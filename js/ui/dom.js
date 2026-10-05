/* Daily Ten — DOM 小工具：$（getElementById）與畫面切換。
   B1：畫面（.screen）＝今日 s-home、訓練 s-train、統計 s-stats、設定 s-setup、早安打卡 s-checkin、Boss 成績輸入 s-boss。
   統計裡的「訓練紀錄 s-hist／身體指標 s-body」是分段（.panel），showScreen('s-hist') 會切到統計並選那一段。
   分頁列只有今日／訓練／統計三顆：設定與早安打卡從今日進入，亮「今日」；Boss 成績輸入不亮任何一顆（同 M1）。 */
export const $=id=>document.getElementById(id);

const TAB_OF={'s-home':'s-home','s-setup':'s-home','s-checkin':'s-home','s-train':'s-train','s-stats':'s-stats'};

function selectPanel(screen,panel){
  screen.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p===panel));
  screen.querySelectorAll('[role="tab"][data-s]').forEach(b=>{
    const on=b.dataset.s===panel.id;
    b.setAttribute('aria-selected',String(on));
    b.tabIndex=on?0:-1;
  });
}

export function showScreen(id){
  const el=$(id); if(!el)return;
  const panel=el.classList.contains('panel')?el:null;
  const screen=panel?el.closest('.screen'):el;
  const changed=!screen.classList.contains('active');
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s===screen));
  if(panel)selectPanel(screen,panel);
  const tab=TAB_OF[screen.id]||null;
  document.querySelectorAll('#tabs button').forEach(b=>{
    const on=b.dataset.s===tab;
    b.classList.toggle('on',on);
    if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  /* 換畫面（或換統計分段）從最上面開始看 */
  if(changed||panel)window.scrollTo(0,0);
}
