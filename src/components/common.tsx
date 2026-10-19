import type { ReactNode } from 'react';
import type { Company } from '../types';
import type { EtaResult } from '../api/eta';
import { useT } from '../i18n';
import { useNow } from '../hooks';
import { hkClock, minutesUntil } from '../utils/time';
import { useUi } from '../store';
import { BusIcon } from './icons';

export function CompanyBadge({ co, plain }: { co: Company; plain?: boolean }) {
  const t = useT();
  return (
    <span className={`badge badge-${co}`} aria-label={t(`co.${co}`)}>
      {!plain && <BusIcon co={co} size={18} />}
      {co === 'KMB' ? '九巴' : '城巴'}
    </span>
  );
}

/** Next 3 buses: first one big, the rest smaller, with clock time under each. */
export function ArrivalList({
  result,
  loading,
  error,
  onRetry,
  compact,
}: {
  result?: EtaResult;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const now = useNow(10000);

  if (!result) {
    if (error)
      return (
        <button className="eta-error" onClick={onRetry}>
          {t('loadError')}
        </button>
      );
    return (
      <div className="eta-row" aria-busy="true">
        <span className="skeleton big" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    );
  }

  const withEta = result.rows.filter((r) => r.eta);
  const remark = result.rows.find((r) => r.remarkTc)?.remarkTc;
  if (!withEta.length) {
    return <div className="eta-none">{remark || t('noInfo')}</div>;
  }
  const isLast = (s: string) => /尾班|最後班次/.test(s);

  return (
    <div className={`eta-row ${error ? 'stale' : ''} ${compact ? 'compact' : ''}`} aria-live="polite">
      {[0, 1, 2].map((i) => {
        const r = withEta[i];
        if (!r) return <span key={i} className="eta muted">{t('noBus')}</span>;
        const m = minutesUntil(r.eta!, r.dataTimestamp, result.fetchedAt, now);
        return (
          <span key={i} className={`eta ${i === 0 ? 'first' : ''}`}>
            <span className="eta-min">
              {m === 0 ? (
                t('arriving')
              ) : (
                <>
                  <b>{m}</b> <small>{t('min')}</small>
                </>
              )}
            </span>
            <span className="eta-clock">{hkClock(r.eta!)}</span>
            {r.remarkTc && (
              <span className={`chip ${isLast(r.remarkTc) ? 'chip-red' : ''}`}>
                {isLast(r.remarkTc) ? t('lastBus') : r.remarkTc}
              </span>
            )}
          </span>
        );
      })}
      {loading && <span className="spinner" aria-hidden />}
      {error && <span className="as-of">{t('asOf', { t: hkClock(new Date(result.fetchedAt)) })}</span>}
    </div>
  );
}

export function UpdatedLabel({ at, onRefresh, loading }: { at: number | null; onRefresh: () => void; loading?: boolean }) {
  const t = useT();
  const now = useNow(1000);
  const s = at ? Math.max(0, Math.round((now - at) / 1000)) : null;
  return (
    <button className="updated" onClick={onRefresh} aria-label={t('refresh')}>
      <span className={loading ? 'spin' : ''}>↻</span> {s === null ? '' : s < 3 ? t('updatedJust') : t('updated', { s })}
    </button>
  );
}

export function Header({ title, right, back, icon }: { title: ReactNode; right?: ReactNode; back?: boolean; icon?: ReactNode }) {
  return (
    <header className="header">
      {back && (
        <button className="icon-btn" onClick={() => history.back()} aria-label="返回">
          ‹
        </button>
      )}
      {icon && <span className="header-icon wiggle">{icon}</span>}
      <h1>{typeof title === 'string' ? <span className="grad">{title}</span> : title}</h1>
      <div className="header-right">{right}</div>
    </header>
  );
}

export function Toast() {
  const msg = useUi((s) => s.toast);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

export function Footnote() {
  const t = useT();
  return <p className="footnote">{t('estimateNote')}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
