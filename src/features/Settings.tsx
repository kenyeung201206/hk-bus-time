import { VoicePicker } from '../alerts/VoicePicker';
import { BellIcon } from '../components/icons';
import { reminderMarks } from '../alerts/schedule';
import { sayMinutes } from '../alerts/voice';
import { GearIcon } from '../components/icons';
import { useRef } from 'react';
import { useFavs, useSettings, useUi } from '../store';
import { useData, clearCache } from '../data/sync';
import { useT } from '../i18n';
import { Header } from '../components/common';
import { THEMES } from '../themes';

export function SettingsScreen() {
  const t = useT();
  const settings = useSettings();
  const { syncedAt, updating, updateNow } = useData();
  const favs = useFavs();
  const showToast = useUi((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ favourites: favs.favourites, savedTrips: favs.savedTrips }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hk-bus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = async (file: File) => {
    try {
      const ok = favs.importBackup(JSON.parse(await file.text()));
      showToast(ok ? t('settings.imported') : t('settings.importFail'));
    } catch {
      showToast(t('settings.importFail'));
    }
  };

  const clearAll = async () => {
    if (!confirm(t('settings.clearConfirm'))) return;
    localStorage.clear();
    await clearCache();
    location.reload();
  };

  return (
    <div>
      <Header title={t('settings.title')} icon={<GearIcon />} />

      <section className="card">
        <h2 className="section-title">{t('settings.theme')}</h2>
        {(['cute', 'cool'] as const).map((style) => (
        <div key={style}>
        <h3 className="theme-group">{t(`settings.themeGroup.${style}`)}</h3>
        <div className="theme-grid">
          {THEMES.filter((th) => th.style === style).map((th) => (
            <button
              key={th.id}
              data-theme={th.id}
              data-style={th.style}
              className={`theme-option ${settings.theme === th.id ? 'selected' : ''}`}
              aria-pressed={settings.theme === th.id}
              onClick={() => settings.set({ theme: th.id })}
            >
              <span className="theme-preview">
                <span className="tp-mascot">{th.mascot}</span>
                <span className="tp-card">
                  <span className="badge badge-KMB">九巴</span>
                  <b>1A</b>
                  <span className="tp-eta">3 分鐘</span>
                </span>
              </span>
              <span className="theme-name">{th.name}</span>
              <span className="theme-sample">{th.sample}</span>
              {settings.theme === th.id && <span className="tick">✓</span>}
            </button>
          ))}
        </div>
        </div>
        ))}
      </section>

      <section className="card">
        <label className="switch-row">
          <span>{t('settings.location')}</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.useLocation}
            onChange={(e) => settings.set({ useLocation: e.target.checked })}
          />
        </label>
        <p className="muted small">{t('settings.locationHint')}</p>
      </section>

      <section className="card">
        <h2 className="section-title">{t('settings.mode')}</h2>
        <Seg
          value={settings.mode}
          options={['auto', 'light', 'dark'] as const}
          label={(v) => t(`settings.mode.${v}`)}
          onChange={(mode) => settings.set({ mode })}
        />
        <h2 className="section-title">{t('settings.textSize')}</h2>
        <Seg
          value={settings.textSize}
          options={['normal', 'large', 'xl'] as const}
          label={(v) => t(`settings.text.${v}`)}
          onChange={(textSize) => settings.set({ textSize })}
        />
        <h2 className="section-title">{t('settings.refresh')}</h2>
        <Seg
          value={settings.refreshSec}
          options={[15, 30, 60] as const}
          label={(v) => t('settings.sec', { n: v })}
          onChange={(refreshSec) => settings.set({ refreshSec })}
        />
      </section>

      <section className="card">
        <h2 className="section-title">
          <BellIcon on={settings.alertsOn} /> {t('settings.alerts')}
        </h2>
        <label className="switch-row">
          <span>{t('settings.alertsOn')}</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.alertsOn}
            onChange={(e) => settings.set({ alertsOn: e.target.checked })}
          />
        </label>
        {settings.alertsOn && (
          <>
            <p className="muted small">{t('settings.alertsHint')}</p>
            <h2 className="section-title">{t('settings.alertStart')}</h2>
            <label className="custom-min">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={settings.alertStart}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (n >= 1) settings.set({ alertStart: n });
                }}
              />
              {t('min')}
            </label>
            <h2 className="section-title">{t('settings.alertStep')}</h2>
            <Seg
              value={settings.alertStep}
              options={[1, 2, 3, 4, 5] as const}
              label={(v) => `${v} ${t('min')}`}
              onChange={(alertStep) => settings.set({ alertStep })}
            />
            <p className="alert-preview">
              🗣️ {t('alert.preview', { list: reminderMarks(settings.alertStart, settings.alertStep).join('、') })}
            </p>
            <h2 className="section-title">{t('settings.voice')}</h2>
            <VoicePicker />
            <button className="big-btn secondary voice-test" onClick={() => sayMinutes(settings.voice, settings.alertStart)}>
              {t('settings.voiceTest')}
            </button>
            <label className="switch-row">
              <span>{t('settings.keepAwake')}</span>
              <input
                type="checkbox"
                className="switch"
                checked={settings.keepAwake}
                onChange={(e) => settings.set({ keepAwake: e.target.checked })}
              />
            </label>
            <p className="muted small">{t('settings.alertsNote')}</p>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">{t('settings.data')}</h2>
        <p className="muted">
          {t('settings.dataUpdated', { t: syncedAt ? new Date(syncedAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }) : '—' })}
        </p>
        <button className="big-btn secondary" onClick={updateNow} disabled={updating}>
          {updating ? t('settings.updating') : t('settings.updateNow')}
        </button>
      </section>

      <section className="card">
        <h2 className="section-title">{t('settings.backup')}</h2>
        <div className="btn-row">
          <button className="pill-btn" onClick={exportBackup}>
            ⬇ {t('settings.export')}
          </button>
          <button className="pill-btn" onClick={() => fileRef.current?.click()}>
            ⬆ {t('settings.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])}
          />
        </div>
        <button className="pill-btn danger" onClick={clearAll}>
          🗑 {t('settings.clear')}
        </button>
      </section>

      <section className="card">
        <h2 className="section-title">{t('settings.about')}</h2>
        <p>{t('settings.aboutText')}</p>
        <a className="link-btn" href="https://data.gov.hk/tc/terms-and-conditions" target="_blank" rel="noreferrer">
          {t('settings.terms')} ↗
        </a>
      </section>
    </div>
  );
}

function Seg<T extends string | number>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={value === o} className={value === o ? 'active' : ''} onClick={() => onChange(o)}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}
