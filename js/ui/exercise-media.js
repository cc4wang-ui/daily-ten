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
  frameMs: Object.freeze([150,150,450,450,450,450,450,450,125,125,125,125,125,125,125,125])
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
}),Object.freeze({
  names: Object.freeze(['彈力帶肩上推','彈力帶肩上推 第1組','彈力帶肩上推 第2組']),
  src: './media/exercises/band-overhead-press-storyboard.png', columns: 4, frames: 16,
  note: '雙腳踩穩帶子，從肩旁推起再慢慢回到肩旁；核心收緊、不後仰。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['彈力帶羅馬尼亞硬舉','彈力帶羅馬尼亞硬舉 第1組','彈力帶羅馬尼亞硬舉 第2組']),
  src: './media/exercises/band-rdl-storyboard.png', columns: 4, frames: 16,
  note: '雙腳踩住帶子，膝微彎、髖往後推，再回到站姿。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['原地快走','原地快走 R1','原地快走 R2','原地快走 R3','原地快走 R4','原地快走 R5']),
  src: './media/exercises/march-in-place-storyboard.png', columns: 4, frames: 16,
  note: '左右交替原地踏步、不跳躍；示意節奏，可依體感放慢。影格不會計算訓練次數。',
  frameMs: Object.freeze([150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150])
}),Object.freeze({
  names: Object.freeze(['側步開合','側步開合 R1','側步開合 R2','側步開合 R3','側步開合 R4','側步開合 R5']),
  src: './media/exercises/step-jack-storyboard.png', columns: 4, frames: 16,
  note: '左右輪流側跨再收回，不跳躍；示意節奏，可依體感放慢。影格不會計算訓練次數。',
  frameMs: Object.freeze([150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150])
}),Object.freeze({
  names: Object.freeze(['分腿蹲 · 左','分腿蹲 第1組 · 左','分腿蹲 第2組 · 左']),
  src: './media/exercises/split-squat-left-storyboard.png', columns: 4, frames: 16,
  note: '左腳在前，雙腳不換位；影格展示下蹲與站起，必要時可暫停並逐格查看姿勢。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['分腿蹲 · 右','分腿蹲 第1組 · 右','分腿蹲 第2組 · 右']),
  src: './media/exercises/split-squat-right-storyboard.png', columns: 4, frames: 16,
  note: '右腳在前，雙腳不換位；影格展示下蹲與站起，必要時可暫停並逐格查看姿勢。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['平板支撐','平板支撐測驗']),
  src: './media/exercises/forearm-plank-storyboard.png', columns: 4, frames: 16,
  note: '靜態保持，影格包含進入與退出；訓練／測驗時間以目前計時器為準，可暫停中間影格看姿勢。',
  frameMs: Object.freeze([180,220,260,300,1500,1500,1500,1500,1500,1500,1500,1500,300,260,220,180])
}),Object.freeze({
  names: Object.freeze(['彈力帶開肩','彈力帶開肩 第1組','彈力帶開肩 第2組','彈力帶開肩 加練']),
  src: './media/exercises/band-pull-apart-storyboard.png', columns: 4, frames: 16,
  note: '雙手握住帶子，在胸前水平向兩側拉開再慢慢回到前方；帶子不固定在門、牆或腳下。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['彈力帶側平舉']),
  src: './media/exercises/band-lateral-raise-storyboard.png', columns: 4, frames: 16,
  note: '雙腳踩穩帶子，雙臂從身側抬到肩高，再慢慢放下；不抬過肩高。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['俯臥 Y 舉']),
  src: './media/exercises/prone-y-raise-storyboard.png', columns: 4, frames: 16,
  note: '俯臥時雙臂呈 Y 字形、拇指朝上，小幅度抬起手臂；軀幹與雙腿維持貼地。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['俯臥 T 舉']),
  src: './media/exercises/prone-t-raise-storyboard.png', columns: 4, frames: 16,
  note: '俯臥時雙臂呈 T 字形，小幅度抬起手臂；軀幹與雙腿維持貼地。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['俯臥 T 舉 · 慢速']),
  src: './media/exercises/prone-t-raise-storyboard.png', columns: 4, frames: 16,
  sameMotionAs: '俯臥 T 舉',
  note: '俯臥時雙臂呈 T 字形，小幅度抬起手臂；軀幹與雙腿維持貼地。慢速影格每次循環約 4 秒。',
  frameMs: Object.freeze([250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250])
}),Object.freeze({
  names: Object.freeze(['穿針式 · 左']),
  src: './media/exercises/needle-left-storyboard.png', columns: 4, frames: 16,
  note: '左手從身體下方穿過、左肩慢慢靠近墊面，再回到四足跪姿；撐地手不移開。影格每次循環約 4 秒。',
  frameMs: Object.freeze([250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250])
}),Object.freeze({
  names: Object.freeze(['穿針式 · 右']),
  src: './media/exercises/needle-right-storyboard.png', columns: 4, frames: 16,
  note: '右手從身體下方穿過、右肩慢慢靠近墊面，再回到四足跪姿；撐地手不移開。影格每次循環約 4 秒。',
  frameMs: Object.freeze([250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250])
}),Object.freeze({
  names: Object.freeze(['側平板 · 左']),
  src: './media/exercises/side-plank-left-storyboard.png', columns: 4, frames: 16,
  note: '左前臂撐地，手肘在肩下，抬髖後靜態保持。影格包含進入、停留與退出；請依訓練計時器保持，不要跟著循環反覆抬落髖部。',
  frameMs: Object.freeze([300,300,300,300,500,1500,1500,1500,1500,1500,1500,1500,500,300,300,300])
}),Object.freeze({
  names: Object.freeze(['側平板 · 右']),
  src: './media/exercises/side-plank-right-storyboard.png', columns: 4, frames: 16,
  note: '右前臂撐地，手肘在肩下，抬髖後靜態保持。影格包含進入、停留與退出；請依訓練計時器保持，不要跟著循環反覆抬落髖部。',
  frameMs: Object.freeze([300,300,300,300,500,1500,1500,1500,1500,1500,1500,1500,500,300,300,300])
}),Object.freeze({
  names: Object.freeze(['嬰兒式側伸展']),
  src: './media/exercises/child-side-stretch-storyboard.png', columns: 4, frames: 16,
  note: '臀部坐回腳跟，雙手向一側移動並停留，時間過半再換邊；左右各做一半時間。影格只展示兩側路徑，不是實際停留的倒數速度，可暫停影格看姿勢。',
  frameMs: Object.freeze([300,300,400,500,1200,1200,500,400,300,400,500,1200,1200,500,400,300])
}),Object.freeze({
  names: Object.freeze(['俯臥半程雪天使']),
  src: './media/exercises/prone-half-floor-angel-storyboard.png', columns: 4, frames: 16,
  note: '俯臥、軀幹與腿貼地，手臂由髖旁小幅抬離墊面，向外移動並彎肘成 W，再沿原路回到髖旁；維持這個半程範圍。影格每次循環約 4 秒。',
  frameMs: Object.freeze([250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250])
}),Object.freeze({
  names: Object.freeze(['派克伏地挺身','派克伏地挺身 第1組','派克伏地挺身 第2組']),
  src: './media/exercises/pike-push-up-storyboard.png', columns: 4, frames: 16,
  note: '雙腳踩地、髖抬高成倒 V，彎肘讓頭部往雙手前方下放，再推回；選擇能控制的活動範圍。影格每次循環約 4 秒。',
  frameMs: Object.freeze([250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250])
}),Object.freeze({
  names: Object.freeze(['躺姿脊椎扭轉']),
  src: './media/exercises/supine-twist-storyboard.png', columns: 4, frames: 16,
  note: '仰躺、雙臂打開，雙膝一起倒向一側、肩膀盡量貼地，時間過半回中再換邊；左右各做一半時間。影格前後兩段展示兩側路徑，不是實際停留的倒數速度，可暫停影格看姿勢。',
  frameMs: Object.freeze([300,400,500,1200,1200,500,400,300,300,400,500,1200,1200,500,400,300])
}),Object.freeze({
  names: Object.freeze(['世界最強伸展 · 左']),
  src: './media/exercises/worlds-greatest-stretch-left-storyboard.png', columns: 4, frames: 16,
  note: '左腳在前弓步，右手撐地，左手肘往左腳內側下沉，再轉胸抬起左手並慢慢回到原位。影格展示進入伸展的路徑，請依訓練計時器完成，不用跟著循環計次。',
  frameMs: Object.freeze([300,300,400,500,1000,500,500,1000,1500,1500,500,500,500,400,300,300])
}),Object.freeze({
  names: Object.freeze(['世界最強伸展 · 右']),
  src: './media/exercises/worlds-greatest-stretch-right-storyboard.png', columns: 4, frames: 16,
  note: '右腳在前弓步，左手撐地，右手肘往右腳內側下沉，再轉胸抬起右手並慢慢回到原位。影格展示進入伸展的路徑，請依訓練計時器完成，不用跟著循環計次。',
  frameMs: Object.freeze([300,300,400,500,1000,500,500,1000,1500,1500,500,500,500,400,300,300])
}),Object.freeze({
  names: Object.freeze(['鴿式']),
  src: './media/exercises/pigeon-pose-storyboard.png', columns: 4, frames: 16,
  note: '前腿彎曲、後腿向後伸，雙手撐地，慢慢向前俯身停留；時間過半回到四足跪姿再換邊，左右各做一半時間。影格展示兩側進入與退出的路徑，不是實際停留的倒數速度，可暫停看姿勢。',
  frameMs: Object.freeze([300,300,400,500,1200,1200,500,400,300,300,400,500,1200,1200,500,400])
}),Object.freeze({
  names: Object.freeze(['下犬↔上犬流動']),
  src: './media/exercises/down-up-dog-flow-storyboard.png', columns: 4, frames: 16,
  note: '下犬推地把髖往後上，慢慢移向上犬、胸口向前上方延伸，再回到下犬；膝蓋維持離地。影格示意轉換路徑，請依體感放慢，訓練時間以計時器為準。',
  frameMs: Object.freeze([375,375,375,375,375,375,375,375,375,375,375,375,375,375,375,375])
}),Object.freeze({
  names: Object.freeze(['深蹲']),
  src: './media/exercises/controlled-squat-storyboard.png', columns: 4, frames: 16,
  sameMotionAs: '控制深蹲',
  note: 'Boss Day 暖身深蹲：雙腳踩穩，屈髖屈膝下蹲再站起；與控制深蹲共用動作影格，本步驟每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['反向雪天使','反向雪天使 加練']),
  src: './media/exercises/reverse-snow-angel-storyboard.png', columns: 4, frames: 16,
  note: '俯臥、軀幹與腿貼地，雙臂小幅離地，由髖旁向外畫弧到頭頂，再回到髖旁。這是無負重上背控制，影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
}),Object.freeze({
  names: Object.freeze(['超人式划船 第1組','超人式划船 第2組','超人式划船 加練','超人式划船（低阻力）']),
  src: './media/exercises/superman-row-storyboard.png', columns: 4, frames: 16,
  note: '俯臥、胸口微離地，雙臂由前伸拉回肋骨旁，再慢慢伸回前方。這是低阻力上背控制，非負重拉；俯視影格主要展示手臂路徑，胸口只需微離地、不刻意抬高。影格每次循環約 3 秒。',
  frameMs: Object.freeze([190,190,190,180,190,190,190,180,190,190,190,180,190,190,190,180])
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
  let stopped=false,loaded=false,attempt=0,image=null,loadTimer=null,slowHintTimer=null;
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
    if(slowHintTimer!==null){clearTimeout(slowHintTimer);slowHintTimer=null;}
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
        // The square grid preserves the source sheet's aspect ratio per frame.
        frameEl.style.aspectRatio=`${pending.naturalWidth} / ${pending.naturalHeight}`;
        // Keep the exact local URL so retries can use the offline cache too.
        frameEl.style.backgroundImage=`url("${entry.src}")`;
        ++attempt;clearLoad();setReady(true);
        wrap.setAttribute('aria-busy','false');status.hidden=true;retry.hidden=true;
        draw();updatePlay();
      }catch{fail();}
    };
    // Keep slow first downloads alive; controls still wait for image decode.
    slowHintTimer=setTimeout(()=>{
      if(!active())return;
      slowHintTimer=null;
      status.textContent='首次下載可能需要較久，完成後可離線查看。你可以返回訓練，稍後再試。';
    },15000);
    // A request that never completes must still offer retry.
    loadTimer=setTimeout(fail,120000);
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
