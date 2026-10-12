/* Reviewed, offline exercise footage only. The catalog intentionally starts empty:
   a clip must be licensed, checked against its exact movement, and reviewed by a
   qualified person before it can appear as instruction. SVG cues are separate. */
export const EXERCISE_MEDIA = Object.freeze([]);

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
