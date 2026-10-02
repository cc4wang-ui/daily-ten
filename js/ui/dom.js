/* Daily Ten — DOM 小工具：$（getElementById）與畫面切換。M1 自 index.html 原樣搬出。 */
export const $=id=>document.getElementById(id);
export function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.s===id));
}
