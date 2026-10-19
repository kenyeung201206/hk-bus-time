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

// One shared element: once a tap has "unlocked" it, iPhone lets it play again later.
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

/** Plays one clip and resolves when it has finished (or failed / timed out). */
function start(voice: VoiceId, file: string, text: string): Promise<void> {
  if (voice === 'device') {
    speakDevice(text);
    return new Promise((r) => setTimeout(r, 3500));
  }
  const a = el();
  a.src = `${import.meta.env.BASE_URL}voice/${voice}/${file}.mp3`;
  const playing = a.play(); // called synchronously so a tap can unlock sound on iPhone
  return new Promise((resolve) => {
    const done = () => resolve();
    a.onended = done;
    a.onerror = () => (speakDevice(text), done());
    playing.catch(() => (speakDevice(text), done()));
    setTimeout(done, 8000);
  });
}

// Clips play one after another so a new reminder never cuts off the previous one.
let current: Promise<void> = Promise.resolve();
let idle = true;
function enqueue(voice: VoiceId, file: string, text: string) {
  const run = () => {
    idle = false;
    return start(voice, file, text).finally(() => (idle = true));
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

/** Call from a tap: confirms the reminder and unlocks audio for later announcements. */
export const sayArmed = (voice: VoiceId) => enqueue(voice, 'armed', ARMED_PHRASE);

/** Fetch the clips a reminder will need so it still talks with a weak signal. */
export function prefetchClips(voice: VoiceId, marks: number[]) {
  if (voice === 'device') return;
  for (const m of marks.filter((x) => x <= 60)) {
    fetch(`${import.meta.env.BASE_URL}voice/${voice}/m${m}.mp3`).catch(() => {});
  }
}
