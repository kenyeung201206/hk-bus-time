// Backup for the spoken reminder: a normal phone notification (with the phone's own
// notification sound + vibration). It still gets through when another app such as
// YouTube or Facebook Live is holding the sound, which a web page can't interrupt.

export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

/** Ask once, from a tap (browsers only allow the question after a user action). */
export async function askNotifyPermission() {
  if (!canNotify() || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* older Safari */
  }
}

export async function notify(title: string, body: string, tag: string) {
  if (!canNotify() || Notification.permission !== 'granted') return;
  // a new tag each time (a replaced notification is silent on iPhone); clear older ones for this bus
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications())?.filter((n) => n.data?.group === tag).forEach((n) => n.close());
  } catch {
    /* ignore */
  }
  const options: NotificationOptions & { vibrate?: number[] } = {
    body,
    tag: `${tag}-${Date.now()}`,
    data: { group: tag },
    vibrate: [200, 100, 200],
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    requireInteraction: false,
  };
  try {
    // installed app: show through the service worker (works while the app is in the background)
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, options);
    new Notification(title, options);
  } catch {
    /* not supported here */
  }
}
