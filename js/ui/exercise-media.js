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
  const frameEl=document.createElement('div');
  frameEl.className='exercise-storyboard-frame';
  frameEl.setAttribute('role','img');
  frameEl.setAttribute('aria-label',`${name} 16 格動作循環`);
  frameEl.style.backgroundImage=`url("${entry.src}")`;
  frameEl.style.backgroundSize=`${entry.columns*100}% ${entry.columns*100}%`;
  const controls=document.createElement('div');
  controls.className='exercise-video-actions';
  const play=document.createElement('button');
  play.type='button';
  const slow=document.createElement('button');
  slow.type='button';slow.textContent='慢速 0.5×';
  const replay=document.createElement('button');
  replay.type='button';replay.textContent='從頭重播';
  const scrub=document.createElement('input');
  scrub.type='range';scrub.min='0';scrub.max=String(entry.frames-1);scrub.value='0';
  scrub.setAttribute('aria-label','逐格查看動作');
  let frame=0,paused=!!(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),slowMode=false,timer=null;
  const draw=()=>{
    const col=frame%entry.columns,row=Math.floor(frame/entry.columns);
    const denom=entry.columns-1;
    frameEl.style.backgroundPosition=`${col/denom*100}% ${row/denom*100}%`;
    scrub.value=String(frame);
  };
  const stopTimer=()=>{if(timer){clearTimeout(timer);timer=null;}};
  const startTimer=()=>{
    stopTimer();if(paused)return;
    const step=()=>{
      timer=setTimeout(()=>{
        frame=(frame+1)%entry.frames;draw();step();
      },(entry.frameMs?.[frame]||180)*(slowMode?2:1));
    };
    step();
  };
  const updatePlay=()=>{play.textContent=paused?'播放影格':'暫停影格';startTimer();};
  play.onclick=()=>{paused=!paused;updatePlay();};
  slow.onclick=()=>{slowMode=!slowMode;slow.textContent=slowMode?'恢復 1×':'慢速 0.5×';startTimer();};
  replay.onclick=()=>{frame=0;draw();};
  scrub.oninput=()=>{paused=true;frame=Number(scrub.value);draw();updatePlay();};
  controls.append(play,slow,replay);
  wrap.append(heading,frameEl,scrub,controls);
  container.replaceChildren(wrap);
  draw();updatePlay();
  return {available:false,storyboard:true,stop(){stopTimer();wrap.remove();}};
}
