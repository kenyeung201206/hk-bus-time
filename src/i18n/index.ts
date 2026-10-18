import zh from './zh-HK.json';
import { themeById } from '../themes';
import { useSettings } from '../store';

type Key = keyof typeof zh;

export function translate(themeId: string, key: Key | string, vars?: Record<string, string | number>): string {
  let s = themeById(themeId).text[key] ?? (zh as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Hook: returns t() bound to the current theme so wording follows the chosen pattern. */
export function useT() {
  const theme = useSettings((s) => s.theme);
  return (key: Key | string, vars?: Record<string, string | number>) => translate(theme, key, vars);
}
