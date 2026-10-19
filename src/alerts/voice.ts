import { isNativeApp, nativeSpeak } from './native';
import { useSettings } from '../store';
// Speaks reminders in Cantonese using pre-recorded Hong Kong Cantonese neural-voice
// clips (public/voice/<voice>/…) for 1–60 minutes. We never fall back to the phone's
// built-in speech: on many phones it speaks Mandarin instead of Cantonese.
export type VoiceId = 'hiugaai' | 'wanlung' | 'kid';
export const VOICE_IDS: VoiceId[] = ['hiugaai', 'wanlung', 'kid'];
/** Older versions had a 'device' voice; anything unknown becomes the default. */
export const safeVoice = (v: string): VoiceId => (VOICE_IDS.includes(v as VoiceId) ? (v as VoiceId) : 'hiugaai');

const DIGITS = '一二三四五六七八九';
/** Cantonese reading of a number of minutes (兩, 十二, 廿五, 三十…). */
export function zhNumber(n: number): string {
  if (n === 2) return '兩';
  if (n < 10) return DIGITS[n - 1];
  if (n === 10) return '十';
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 1) return '十' + DIGITS[u - 1];
  if (t === 2 && u) return '廿' + DIGITS[u - 1];
  if (t >= 10) return String(n);
  return DIGITS[t - 1] + '十' + (u ? DIGITS[u - 1] : '');
}

export const minutesPhrase = (n: number) => `巴士仲有${zhNumber(n)}分鐘就到喇！`;
export const ARMED_PHRASE = '收到！巴士嚟之前，我會提你㗎！';
export const ARRIVED_PHRASE = '巴士已經到站喇！快啲上車啦！';
export const INTRO_PHRASE: Record<VoiceId, string> = {
  hiugaai: '你好呀！我係曉佳，等我提你搭巴士啦！',
  wanlung: '你好！我係雲龍，巴士嚟之前我會提你㗎！',
  kid: '你好呀！我係巴士仔，等我提你搭巴士呀！',
};

/** iPhone / iPad (iPadOS reports itself as a Mac with a touch screen). */
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * iPhone/iPad with 「鎖機語音」 switched off: no background player at all — the app only
 * speaks on screen (alert-style sound) and the push notifications cover the locked screen.
 */
export const iosQuietMode = () => isIOS() && !useSettings.getState().iosLockVoice;

// ---------- two players ----------
// keepEl: an almost-silent track that loops without ever stopping while a reminder is
//   waiting. Something "playing" lets the phone keep the app running when locked or in
//   another app; it also shows 「🔔 83X 仲有 3 分鐘」 on the lock screen.
// voiceEl: plays the Cantonese clips. It is a SEPARATE player, unlocked by the 🔔 tap, so
//   the quiet track never pauses — a pause is exactly when iOS stops letting a locked
//   app start sound again.
let keepEl: HTMLAudioElement | null = null;
let voiceEl: HTMLAudioElement | null = null;
const keep = () => (keepEl ??= Object.assign(new Audio(), { loop: true }));
const voicePlayer = () => (voiceEl ??= new Audio());
let keepAliveOn = false;
let keepLabel = '';
let quietUrl: string | null = null;

function quietTrack(): string {
  if (quietUrl) return quietUrl;
  // 2 s of 8 kHz mono 16-bit PCM with tiny noise (pure silence can be ignored as "not playing")
  const rate = 8000;
  const n = rate * 2;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, str: string) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((Math.random() - 0.5) * 6), true);
  quietUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return quietUrl;
}

function setMediaInfo(title: string | null) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = title ? new MediaMetadata({ title, artist: keepLabel, album: '巴士到站' }) : null;
  try {
    navigator.mediaSession.playbackState = title ? 'playing' : 'none';
  } catch {
    /* older browsers */
  }
}

function startKeep() {
  if (!keepAliveOn) return;
  const k = keep();
  if (!k.src) k.src = quietTrack();
  if (k.paused)
    k.play().catch(() => {
      /* needs a tap first (e.g. after reopening the app); the next tap fixes it */
    });
}

function stopKeep() {
  if (keepEl) {
    keepEl.pause();
    keepEl.removeAttribute('src');
    keepEl.load();
  }
  setMediaInfo(null);
}

/** Turn background keep-alive on/off. `label` shows on the lock screen. */
export function keepAlive(on: boolean, label = '') {
  keepLabel = label;
  keepAliveOn = on && !iosQuietMode();
  if (keepAliveOn) {
    startKeep();
    setMediaInfo('🔔 巴士到站提醒');
  } else stopKeep();
}

/** Lock-screen player title, e.g. 「🔔 83X 仲有 3 分鐘」. */
export function setLockScreenText(text: string) {
  if (keepAliveOn) setMediaInfo(text);
}

// ---------- iPhone/iPad quiet mode: short "alert" sounds through Web Audio ----------
// Used when 「鎖機語音」 is off: no lock-screen player (which makes iOS mute notification
// sounds), clips mix with other audio, and only while the app is on screen.
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

function audioCtx(): AudioContext {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'transient';
  ctx ??= new AudioContext();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

function loadBuffer(url: string): Promise<AudioBuffer> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => audioCtx().decodeAudioData(b));
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
  }
  return p;
}

function startWebAudio(url: string): Promise<void> {
  const c = audioCtx(); // created/resumed synchronously, still inside the tap
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    setTimeout(done, 8000);
    loadBuffer(url)
      .then((buf) => {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.onended = done;
        src.start();
      })
      .catch(done);
  });
}

/**
 * Call inside a tap (the 🔔 開始提醒 button): phones only let sound start after a touch.
 * Starts the never-stopping quiet track in the same tap (the voice player is unlocked by
 * the confirmation clip that plays right after).
 */
export function unlockAudio() {
  if (iosQuietMode()) {
    audioCtx();
    return;
  }
  keepAliveOn = true;
  startKeep();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!iosQuietMode()) return;
    if (document.visibilityState === 'visible') ctx?.resume().catch(() => {});
    else stopKeep(); // quiet mode: nothing left "playing" while locked
  });
  // any touch (e.g. after reopening the app) re-enables sound
  document.addEventListener(
    'pointerdown',
    () => {
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
      if (keepAliveOn && keepEl?.paused) startKeep();
    },
    true,
  );
}

/** Plays one clip and resolves when it has finished (or failed / timed out). */
function start(voice: VoiceId, file: string): Promise<void> {
  const url = `${import.meta.env.BASE_URL}voice/${safeVoice(voice)}/${file}.mp3`;
  if (iosQuietMode()) return startWebAudio(url);
  const a = voicePlayer();
  a.src = url;
  const playing = a.play(); // called synchronously so a tap can unlock the voice player
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    a.onended = done;
    a.onerror = done;
    playing.catch(done); // e.g. another app (YouTube) holds the sound — the notification still shows
    setTimeout(done, 8000);
  });
}

// Clips play one after another so a new reminder never cuts off the previous one.
let current: Promise<void> = Promise.resolve();
let idle = true;
function enqueue(voice: VoiceId, file: string) {
  // quiet mode on iOS can't start sound from the background; the notification covers it
  if (iosQuietMode() && document.visibilityState !== 'visible') return Promise.resolve();
  const run = () => {
    idle = false;
    return start(voice, file).finally(() => {
      idle = true;
      if (keepAliveOn) startKeep(); // make sure the quiet track is still going
    });
  };
  // when nothing is playing, start right now (inside the tap) instead of a microtask later
  current = idle ? run() : current.then(run);
  return current;
}

export function sayMinutes(voice: VoiceId, n: number) {
  navigator.vibrate?.([180, 90, 180]);
  const m = Math.max(1, Math.round(n));
  if (m > 60) return Promise.resolve(); // clips go up to 60 minutes; the notification still shows
  if (isNativeApp()) return nativeSpeak(voice, `m${m}`).catch(() => {});
  return enqueue(voice, `m${m}`);
}

export function sayArrived(voice: VoiceId) {
  navigator.vibrate?.([300, 120, 300, 120, 300]);
  return enqueue(voice, 'arrived');
}

/** Call from a tap: confirms the reminder and unlocks audio for later announcements. */
export const sayArmed = (voice: VoiceId) => enqueue(voice, 'armed');

/** "Hello, I'm …" — used by the voice picker. */
export const sayIntro = (voice: VoiceId) =>
  isNativeApp() ? nativeSpeak(voice, 'intro').catch(() => {}) : enqueue(voice, 'intro');

/** Fetch the clips a reminder will need so it still talks with a weak signal. */
export function prefetchClips(voice: VoiceId, marks: number[]) {
  for (const f of [...marks.filter((x) => x <= 60).map((m) => `m${m}`), 'arrived']) {
    const url = `${import.meta.env.BASE_URL}voice/${safeVoice(voice)}/${f}.mp3`;
    if (iosQuietMode()) loadBuffer(url).catch(() => {});
    else fetch(url).catch(() => {});
  }
}
