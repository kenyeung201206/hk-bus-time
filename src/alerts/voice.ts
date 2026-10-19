// Speaks reminders in Cantonese. Uses pre-recorded neural-voice clips (public/voice/…)
// for 1–60 minutes; anything else, or a failed clip, falls back to the phone's own
// zh-HK speech voice.
export type VoiceId = 'hiugaai' | 'wanlung' | 'device';

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
  device: '你好！我係手機內置嘅廣東話聲音。',
};

// One shared element: once a tap has "unlocked" it, phones let it play again later,
// even from the background.
let audio: HTMLAudioElement | null = null;
const el = () => (audio ??= new Audio());

function speakDevice(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-HK';
  const v = synth.getVoices().find((x) => /zh[-_]HK|yue/i.test(x.lang));
  if (v) u.voice = v;
  u.rate = 1;
  synth.cancel();
  synth.speak(u);
}

// ---------- background keep-alive ----------
// Phones pause a web app as soon as you switch to another app, unless it is playing
// sound. While a reminder is waiting we loop an almost-silent track on the same audio
// element, which keeps the countdown (and the voice) running in the background on most
// phones. It also puts "🔔 巴士到站提醒" on the lock screen / notification shade.
let keepAliveOn = false;
let quietUrl: string | null = null;

function quietTrack(): string {
  if (quietUrl) return quietUrl;
  // 2 s of 8 kHz mono 16-bit PCM with tiny noise (pure silence can be ignored as "not playing")
  const rate = 8000;
  const n = rate * 2;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
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

function playQuiet() {
  if (!keepAliveOn || !idle) return;
  const a = el();
  a.loop = true;
  a.src = quietTrack();
  a.play().catch(() => {
    /* needs a tap first (e.g. after reopening the app); the next 🔔 tap fixes it */
  });
}

/** Turn background keep-alive on/off. `label` shows on the lock screen. */
export function keepAlive(on: boolean, label = '') {
  keepAliveOn = on;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = on
      ? new MediaMetadata({ title: '🔔 巴士到站提醒', artist: label, album: 'HK Bus Time' })
      : null;
  }
  if (on) playQuiet();
  else if (audio && audio.loop) {
    audio.pause();
    audio.loop = false;
  }
}

/** Plays one clip and resolves when it has finished (or failed / timed out). */
function start(voice: VoiceId, file: string, text: string): Promise<void> {
  if (voice === 'device') {
    speakDevice(text);
    return new Promise((r) => setTimeout(r, 3500));
  }
  const a = el();
  a.loop = false;
  a.src = `${import.meta.env.BASE_URL}voice/${voice}/${file}.mp3`;
  const playing = a.play(); // called synchronously so a tap can unlock sound on iPhone
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    a.onended = done;
    a.onerror = () => (speakDevice(text), done());
    playing.catch(() => (speakDevice(text), done()));
    setTimeout(done, 8000);
  });
}

// Clips play one after another so a new reminder never cuts off the previous one.
let current: Promise<void> = Promise.resolve();
let idle = true;
let waiting = 0; // clips queued but not finished
function enqueue(voice: VoiceId, file: string, text: string) {
  waiting++;
  const run = () => {
    idle = false;
    return start(voice, file, text).finally(() => {
      idle = true;
      waiting--;
      if (waiting === 0) playQuiet(); // back to the quiet loop once nothing else is queued
    });
  };
  // when nothing is playing, start right now (inside the tap) instead of a microtask later
  current = idle ? run() : current.then(run);
  return current;
}

export function sayMinutes(voice: VoiceId, n: number) {
  navigator.vibrate?.([180, 90, 180]);
  const m = Math.max(1, Math.round(n));
  if (m > 60) return enqueue('device', '', minutesPhrase(m));
  return enqueue(voice, `m${m}`, minutesPhrase(m));
}

export function sayArrived(voice: VoiceId) {
  navigator.vibrate?.([300, 120, 300, 120, 300]);
  return enqueue(voice, 'arrived', ARRIVED_PHRASE);
}

/** Call from a tap: confirms the reminder and unlocks audio for later announcements. */
export const sayArmed = (voice: VoiceId) => enqueue(voice, 'armed', ARMED_PHRASE);

/** "Hello, I'm …" — used by the voice picker. */
export const sayIntro = (voice: VoiceId) => enqueue(voice, 'intro', INTRO_PHRASE[voice]);

/** Fetch the clips a reminder will need so it still talks with a weak signal. */
export function prefetchClips(voice: VoiceId, marks: number[]) {
  if (voice === 'device') return;
  for (const f of [...marks.filter((x) => x <= 60).map((m) => `m${m}`), 'arrived']) {
    fetch(`${import.meta.env.BASE_URL}voice/${voice}/${f}.mp3`).catch(() => {});
  }
}
