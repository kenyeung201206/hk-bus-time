import { useSettings } from '../store';
import { useT } from '../i18n';
import { safeVoice, sayIntro, type VoiceId } from './voice';

const VOICES: { id: VoiceId; face: string; name: string; desc: string }[] = [
  { id: 'hiugaai', face: '👧', name: 'settings.voice.hiugaai', desc: 'voice.desc.hiugaai' },
  { id: 'wanlung', face: '👦', name: 'settings.voice.wanlung', desc: 'voice.desc.wanlung' },
  { id: 'kid', face: '🧒', name: 'settings.voice.kid', desc: 'voice.desc.kid' },
];

/** Big tappable voice cards: tap to choose (and hear a hello), ▶ to preview again. */
export function VoicePicker() {
  const t = useT();
  const voice = safeVoice(useSettings((s) => s.voice));
  const set = useSettings((s) => s.set);
  return (
    <div className="voice-grid" role="radiogroup" aria-label={t('settings.voice')}>
      {VOICES.map((v) => (
        <div key={v.id} className={`voice-card ${voice === v.id ? 'selected' : ''}`}>
          <button
            className="voice-main"
            role="radio"
            aria-checked={voice === v.id}
            onClick={() => {
              set({ voice: v.id });
              sayIntro(v.id);
            }}
          >
            <span className={`voice-face voice-${v.id}`}>{v.face}</span>
            <b>{t(v.name)}</b>
            <small>{t(v.desc)}</small>
            {voice === v.id && <span className="tick">✓</span>}
          </button>
          <button className="voice-play" onClick={() => sayIntro(v.id)} aria-label={`${t('settings.voiceTest')} ${t(v.name)}`}>
            ▶ {t('voice.listen')}
          </button>
        </div>
      ))}
    </div>
  );
}
