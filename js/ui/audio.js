/* Daily Ten — 提示音（WebAudio）與語音導引（TTS）。M1 自 index.html 原樣搬出。 */
import { getState } from '../state/store.js';

/* ================= AUDIO ================= */
let AC=null;
export function initAudio(){ try{ if(!AC){AC=new (window.AudioContext||window.webkitAudioContext)();}
  if(AC.state==='suspended')AC.resume(); }catch(e){} }
export function beep(freq,dur){ if(!getState().settings.beep||!AC)return;
  try{const o=AC.createOscillator(),g=AC.createGain();o.type='square';o.frequency.value=freq;
  g.gain.setValueAtTime(0.12,AC.currentTime);g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
  o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+dur);}catch(e){} }
export function speak(txt){ if(!getState().settings.voice)return;
  try{ if(!('speechSynthesis' in window))return;
  const u=new SpeechSynthesisUtterance(txt);u.lang='zh-TW';u.rate=1.05;
  speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){} }
