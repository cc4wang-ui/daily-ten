/* Reviewed, offline exercise footage only. The catalog intentionally starts empty:
   a clip must be licensed, checked against its exact movement, and reviewed by a
   qualified person before it can appear as instruction. SVG cues are separate. */
export const EXERCISE_MEDIA = Object.freeze([]);

/* AI 連續影格試作與完整影片分開列。只給完全相同的動作變式使用，
   不把一般伏地挺身套到跪姿、派克或 HRP。 */
export const EXERCISE_STORYBOARDS = Object.freeze([Object.freeze({
  names: Object.freeze(['伏地挺身','伏地挺身 第1組','伏地挺身 第2組']),
  src: './media/exercises/push-up-storyboard-v2.png', columns: 4, frames: 16
}),Object.freeze({
  names: Object.freeze(['控制深蹲']),
  src: './media/exercises/controlled-squat-storyboard.png', columns: 4, frames: 16,
  frameMs: Object.freeze([150,150,450,450,450,450,450,450,150,150,170,170,170,170,170,150])
}),Object.freeze({
  names: Object.freeze(['臀橋','臀橋 第1組','臀橋 第2組']),
  src: './media/exercises/glute-bridge-storyboard.png', columns: 4, frames: 16
}),Object.freeze({
  names: Object.freeze(['彈力帶划船','彈力帶划船 第1組','彈力帶划船 第2組','彈力帶划船 第3組','彈力帶划船 加練']),
  src: './media/exercises/seated-band-row-storyboard.png', columns: 4, frames: 16
}),Object.freeze({
  names: Object.freeze(['貓牛式']),
  src: './media/exercises/cat-cow-storyboard.png', columns: 4, frames: 16
}),Object.freeze({
  names: Object.freeze(['跪姿伏地挺身','伏地挺身 · 跪姿','伏地挺身 第1組 · 跪姿','伏地挺身 第2組 · 跪姿']),
  src: './media/exercises/knee-push-up-storyboard.png', columns: 4, frames: 16
}),Object.freeze({
  names: Object.freeze(['90/90 髖旋轉','90/90 髖旋轉 · 左','90/90 髖旋轉 · 右']),
  src: './media/exercises/hip-90-90-storyboard.png', columns: 4, frames: 16,
  note: '這段展示兩側切換路徑；本步驟只做名稱標示的一側。'
}),Object.freeze({
  names: Object.freeze(['深蹲蹲坐']),
  src: './media/exercises/deep-squat-hold-storyboard.png', columns: 4, frames: 16,
  note: '這是底部停留，不是快速重複深蹲。可暫停影格查看蹲姿。',
  frameMs: Object.freeze([150,150,300,300,300,300,1800,1800,1800,1800,1800,1800,1800,300,300,150])
})]);
export function getExerciseStoryboard(name){
  if(typeof name!=='string')return null;
  return EXERCISE_STORYBOARDS.find(entry=>entry.names.includes(name))||null;
}

const LOCAL_VIDEO = /^\.\/media\/exercises\/[a-z0-9][a-z0-9-]*\.(?:mp4|webm)$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isApprovedExerciseMedia(entry) {
  if (!entry || typeof entry !== 'object' || entry.reviewed !== true) return false;
  if (typeof entry.movementId !== 'string' || !ID.test(entry.movementId)) return false;
  if (!Array.isArray(entry.names) || !entry.names.length ||
      entry.names.some(name => typeof name !== 'string' || !name.trim() || name !== name.trim()) ||
      new Set(entry.names).size !== entry.names.length) return false;
  if (typeof entry.src !== 'string' || !LOCAL_VIDEO.test(entry.src)) return false;
  const review = entry.review;
  if (!review || typeof review !== 'object' ||
      typeof review.reviewer !== 'string' || !review.reviewer.trim() ||
      typeof review.credential !== 'string' || !review.credential.trim() ||
      typeof review.reviewedAt !== 'string' || !validDate(review.reviewedAt) ||
      typeof review.rights !== 'string' || !review.rights.trim()) return false;
  return true;
}

/* Exact names only: "深蹲" must never silently resolve to "深蹲跳" footage.
   Duplicate names are ambiguous and therefore unavailable. */
export function getApprovedExerciseMedia(name, catalog = EXERCISE_MEDIA) {
  if (typeof name !== 'string' || !Array.isArray(catalog)) return null;
  const matches = catalog.filter(entry => isApprovedExerciseMedia(entry) && entry.names.includes(name));
  return matches.length === 1 ? matches[0] : null;
}

/* Returns a small controller so the caller can stop playback when help closes.
   The unavailable message remains in place until a valid clip has actually loaded. */
export function mountExerciseVideo(container, name, catalog = EXERCISE_MEDIA) {
  if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('A container is required');
  const entry = getApprovedExerciseMedia(name, catalog);
  if(!entry){
    const storyboard=getExerciseStoryboard(name);
    if(storyboard)return mountExerciseStoryboard(container,name,storyboard);
  }
  const message = document.createElement('p');
  message.textContent = entry
    ? '正在載入本機動作影片…'
    : '這個動作還沒有經審核的離線影片。若不熟悉動作，請先暫停訓練。';
  container.replaceChildren(message);
  if (!entry) return { available: false, stop() {} };

  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', `${name}完整動作示範`);
  video.src = entry.src;
  const ready = () => {
    if (video.parentNode === container) message.hidden = true;
  };
  const failed = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    actions.remove();
    message.hidden = false;
    message.textContent = '本機動作影片無法載入。若不熟悉動作，請先暫停訓練。';
  };
  video.addEventListener('loadedmetadata', ready, { once: true });
  video.addEventListener('error', failed, { once: true });
  const actions = document.createElement('div');
  actions.className = 'exercise-video-actions';
  const slow = document.createElement('button');
  slow.type = 'button';
  slow.textContent = '慢速 0.5×';
  slow.onclick = () => {
    video.playbackRate = video.playbackRate === 0.5 ? 1 : 0.5;
    slow.textContent = video.playbackRate === 0.5 ? '恢復 1×' : '慢速 0.5×';
  };
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.textContent = '從頭重播';
  replay.onclick = () => { video.currentTime = 0; video.play().catch(() => {}); };
  actions.append(slow, replay);
  container.append(video, actions);
  return {
    available: true,
    stop() {
      video.removeEventListener('loadedmetadata', ready);
      video.removeEventListener('error', failed);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      actions.remove();
    }
  };
}

function mountExerciseStoryboard(container,name,entry){
  const wrap=document.createElement('div');
  wrap.className='exercise-storyboard';
  const heading=document.createElement('p');
  heading.textContent='AI 動作影格試作 · 16 格循環（非真人影片）';
  const note=entry.note?document.createElement('p'):null;
  if(note){note.className='exercise-storyboard-note';note.textContent=entry.note;}
  const frameEl=document.createElement('div');
  frameEl.className='exercise-storyboard-frame';
  frameEl.setAttribute('role','img');
  frameEl.setAttribute('aria-label',`${name} 16 格動作循環`);
  frameEl.style.backgroundSize=`${entry.columns*100}% ${entry.columns*100}%`;
  const controls=document.createElement('div');
  controls.className='exercise-video-actions';
  const status=document.createElement('p');
  status.setAttribute('role','status');
  const retry=document.createElement('button');
  retry.type='button';retry.textContent='重試載入影格';retry.hidden=true;
  const play=document.createElement('button');
  play.type='button';
  const slow=document.createElement('button');
  slow.type='button';slow.textContent='慢速 0.5×';
  const replay=document.createElement('button');
  replay.type='button';replay.textContent='從頭重播';
  const scrub=document.createElement('input');
  scrub.type='range';scrub.min='0';scrub.max=String(entry.frames-1);scrub.value='0';
  scrub.setAttribute('aria-label','逐格查看動作');
  let stopped=false,loaded=false,attempt=0,image=null,loadTimer=null;
  let frame=0,paused=!!(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),slowMode=false,timer=null;
  const draw=()=>{
    const col=frame%entry.columns,row=Math.floor(frame/entry.columns);
    const denom=entry.columns-1;
    frameEl.style.backgroundPosition=`${col/denom*100}% ${row/denom*100}%`;
    scrub.value=String(frame);
  };
  const stopTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  const startTimer=()=>{
    stopTimer();if(stopped||!loaded||paused)return;
    const step=()=>{
      timer=setTimeout(()=>{
        if(stopped||!loaded||paused)return;
        frame=(frame+1)%entry.frames;draw();step();
      },(entry.frameMs?.[frame]||180)*(slowMode?2:1));
    };
    step();
  };
  const updatePlay=()=>{play.textContent=paused?'播放影格':'暫停影格';startTimer();};
  play.onclick=()=>{if(stopped||!loaded)return;paused=!paused;updatePlay();};
  slow.onclick=()=>{if(stopped||!loaded)return;slowMode=!slowMode;slow.textContent=slowMode?'恢復 1×':'慢速 0.5×';startTimer();};
  replay.onclick=()=>{if(stopped||!loaded)return;frame=0;draw();};
  scrub.oninput=()=>{if(stopped||!loaded)return;paused=true;frame=Number(scrub.value);draw();updatePlay();};
  controls.append(play,slow,replay);
  wrap.append(heading);
  if(note)wrap.append(note);
  wrap.append(status,retry,frameEl,scrub,controls);
  container.replaceChildren(wrap);
  const clearLoad=()=>{
    if(loadTimer!==null){clearTimeout(loadTimer);loadTimer=null;}
    if(image){image.onload=null;image.onerror=null;image.removeAttribute('src');image=null;}
  };
  const setReady=(ready)=>{
    loaded=ready;
    frameEl.hidden=scrub.hidden=controls.hidden=!ready;
    play.disabled=slow.disabled=replay.disabled=scrub.disabled=!ready;
  };
  const load=()=>{
    if(stopped)return;
    const current=++attempt;
    clearLoad();stopTimer();setReady(false);
    status.hidden=false;status.textContent='正在載入動作影格…';retry.hidden=true;
    wrap.setAttribute('aria-busy','true');
    const pending=new Image();
    image=pending;
    const active=()=>!stopped&&current===attempt;
    const fail=()=>{
      if(!active())return;
      ++attempt;clearLoad();stopTimer();setReady(false);
      wrap.setAttribute('aria-busy','false');
      status.hidden=false;
      status.textContent='本機動作影格無法載入。請重試；若不熟悉動作，請先暫停訓練。';
      retry.hidden=false;
    };
    pending.onerror=fail;
    pending.onload=async()=>{
      if(!active())return;
      try{
        if(typeof pending.decode==='function')await pending.decode();
        if(!active())return;
        if(!pending.naturalWidth||!pending.naturalHeight){fail();return;}
        // Keep the exact local URL so retries can use the offline cache too.
        frameEl.style.backgroundImage=`url("${entry.src}")`;
        ++attempt;clearLoad();setReady(true);
        wrap.setAttribute('aria-busy','false');status.hidden=true;retry.hidden=true;
        draw();updatePlay();
      }catch{fail();}
    };
    // A stalled request must also offer a way to recover.
    loadTimer=setTimeout(fail,15000);
    pending.src=entry.src;
  };
  retry.onclick=load;
  draw();updatePlay();load();
  return {available:false,storyboard:true,stop(){
    if(stopped)return;
    stopped=true;++attempt;loaded=false;
    stopTimer();clearLoad();
    play.onclick=slow.onclick=replay.onclick=retry.onclick=scrub.oninput=null;
    frameEl.style.backgroundImage='none';wrap.remove();
  }};
}
