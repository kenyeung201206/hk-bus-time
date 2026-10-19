// Bridge to the Android app's native reminder service (see android/…/BusReminderPlugin.java).
// In the Android app, reminders are counted down and spoken by a foreground service, so
// they keep talking with the screen locked and over YouTube. On the web this is a no-op.
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeReminder {
  key: string;
  co: string;
  route: string;
  dir: string;
  serviceType: number;
  stopId: string;
  seq: number;
  stopName: string;
  marks: number[];
  voice: string;
}

interface BusReminderPlugin {
  start(options: NativeReminder): Promise<void>;
  stop(options: { key: string }): Promise<void>;
  speak(options: { voice: string; clip: string }): Promise<void>;
}

const BusReminder = registerPlugin<BusReminderPlugin>('BusReminder');

export const isNativeApp = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BusReminder');

export const nativeStart = (r: NativeReminder) => BusReminder.start(r);
export const nativeStop = (key: string) => BusReminder.stop({ key });
/** Play a voice clip through the app (used for the confirmation / test buttons). */
export const nativeSpeak = (voice: string, clip: string) => BusReminder.speak({ voice, clip });
