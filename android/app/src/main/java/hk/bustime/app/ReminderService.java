package hk.bustime.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Foreground service that keeps bus reminders running with the screen off.
 * Every second it counts down each reminder against its latest ETA (refreshed every
 * 25 s, or every 10 s once the bus is within 4 minutes) and, the moment the shown
 * minute reaches a reminder mark, speaks the Cantonese clip and posts a notification.
 * When the arrival time passes it says 「巴士已經到站喇！」 and the reminder ends.
 */
public class ReminderService extends Service {
    static final String ACTION_START = "hk.bustime.app.START";
    static final String ACTION_STOP = "hk.bustime.app.STOP";
    private static final String CH_RUNNING = "reminder_running";
    private static final String CH_ALERT = "reminder_alert";
    private static final int ONGOING_ID = 1;
    private static final long AT_STOP_MS = 120_000;
    private static final long MAX_AGE_MS = 3 * 3600_000L;

    static final class Reminder {
        String key, co, route, dir, stopId, stopName, voice;
        int serviceType, seq;
        TreeSet<Integer> pending = new TreeSet<>();
        long createdAt = System.currentTimeMillis();
        Long eta; // ms
        long fetchedAt;
        boolean fetching;
    }

    private final Map<String, Reminder> reminders = new LinkedHashMap<>();
    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock wake;

    @Override
    public void onCreate() {
        super.onCreate();
        thread = new HandlerThread("bus-reminders");
        thread.start();
        handler = new Handler(thread.getLooper());
        createChannels();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "hkbus:reminders");
        wake.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        goForeground("🔔 巴士到站提醒進行中");
        if (intent != null) {
            String json = intent.getStringExtra("reminder");
            String key = intent.getStringExtra("key");
            handler.post(() -> {
                if (ACTION_START.equals(intent.getAction()) && json != null) add(json);
                if (ACTION_STOP.equals(intent.getAction()) && key != null) reminders.remove(key);
                if (reminders.isEmpty()) finish();
                else {
                    if (!wake.isHeld()) wake.acquire(MAX_AGE_MS);
                    handler.removeCallbacks(tick);
                    handler.post(tick);
                }
            });
        }
        return START_STICKY;
    }

    private void add(String json) {
        try {
            JSONObject o = new JSONObject(json);
            Reminder r = new Reminder();
            r.key = o.getString("key");
            r.co = o.getString("co");
            r.route = o.getString("route");
            r.dir = o.getString("dir");
            r.serviceType = o.optInt("serviceType", 1);
            r.stopId = o.getString("stopId");
            r.seq = o.optInt("seq", 0);
            r.stopName = o.optString("stopName", "");
            r.voice = o.optString("voice", "hiugaai");
            JSONArray marks = o.getJSONArray("marks");
            for (int i = 0; i < marks.length(); i++) r.pending.add(marks.getInt(i));
            reminders.put(r.key, r);
        } catch (Exception ignored) {
        }
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            String status = null;
            Iterator<Reminder> it = reminders.values().iterator();
            while (it.hasNext()) {
                Reminder r = it.next();
                if (now - r.createdAt > MAX_AGE_MS) {
                    it.remove();
                    continue;
                }
                boolean close = r.eta != null && r.eta - now < 240_000;
                if (!r.fetching && now - r.fetchedAt >= (close ? 10_000 : 25_000)) fetchEta(r);
                if (r.eta == null) continue;
                double sec = (r.eta - now) / 1000.0;
                if (sec <= 0) {
                    VoicePlayer.get(ReminderService.this).play(r.voice, "arrived");
                    alert(r, "🚏 " + r.route + " 已經到站！快啲上車！");
                    it.remove();
                    continue;
                }
                int m = (int) Math.floor(sec / 60);
                Integer crossed = r.pending.ceiling(m); // any mark ≥ m was just reached
                if (crossed != null) {
                    int say = Math.max(1, m);
                    if (say <= 60) VoicePlayer.get(ReminderService.this).play(r.voice, "m" + say);
                    alert(r, "🔔 " + r.route + " 仲有 " + say + " 分鐘就到！");
                    r.pending.tailSet(m, true).clear();
                }
                if (status == null) status = r.route + " · 仲有 " + Math.max(0, m) + " 分鐘 · " + r.stopName;
            }
            if (reminders.isEmpty()) {
                finish();
                return;
            }
            goForeground(status != null ? "🔔 " + status : "🔔 巴士到站提醒進行中");
            handler.postDelayed(this, 1000);
        }
    };

    /** Fetch the live ETA on a worker thread so the 1-second tick never waits for the network. */
    private void fetchEta(Reminder r) {
        r.fetching = true;
        new Thread(() -> {
            Long eta = null;
            boolean ok = false;
            try {
                String route = URLEncoder.encode(r.route, "UTF-8");
                String url = "KMB".equals(r.co)
                        ? "https://data.etabus.gov.hk/v1/transport/kmb/eta/" + r.stopId + "/" + route + "/" + r.serviceType
                        : "https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/" + r.stopId + "/" + route;
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (HK Bus Time Android)");
                StringBuilder sb = new StringBuilder();
                try (BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = in.readLine()) != null) sb.append(line);
                }
                JSONArray data = new JSONObject(sb.toString()).optJSONArray("data");
                List<JSONObject> rows = new ArrayList<>();
                TreeSet<Integer> seqs = new TreeSet<>();
                for (int i = 0; data != null && i < data.length(); i++) {
                    JSONObject row = data.getJSONObject(i);
                    if (!r.dir.equals(row.optString("dir"))) continue;
                    if ("KMB".equals(r.co) && row.optInt("service_type", 1) != r.serviceType) continue;
                    rows.add(row);
                    seqs.add(row.optInt("seq"));
                }
                long now = System.currentTimeMillis();
                rows.sort((a, b) -> a.optInt("eta_seq") - b.optInt("eta_seq"));
                for (JSONObject row : rows) {
                    if (seqs.size() > 1 && row.optInt("seq") != r.seq) continue; // circular routes
                    String e = row.optString("eta", "");
                    if (e.isEmpty() || "null".equals(e)) continue;
                    long t = OffsetDateTime.parse(e).toInstant().toEpochMilli();
                    if (t > now - AT_STOP_MS) {
                        eta = t;
                        break;
                    }
                }
                ok = true;
            } catch (Exception ignored) {
                // keep counting down on the last good time
            }
            final Long result = eta;
            final boolean success = ok;
            handler.post(() -> {
                if (success) {
                    r.eta = result;
                    r.fetchedAt = System.currentTimeMillis();
                } else {
                    r.fetchedAt = System.currentTimeMillis() - 15_000; // retry sooner
                }
                r.fetching = false;
            });
        }).start();
    }

    private void createChannels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel running = new NotificationChannel(CH_RUNNING, "提醒進行中", NotificationManager.IMPORTANCE_LOW);
        running.setDescription("等緊巴士時顯示，令手機鎖機都繼續倒數");
        running.setShowBadge(false);
        nm.createNotificationChannel(running);
        NotificationChannel alert = new NotificationChannel(CH_ALERT, "到站提醒", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("巴士快到時嘅提醒");
        alert.setSound(null, null); // the Cantonese voice is the sound
        alert.enableVibration(true);
        alert.setVibrationPattern(new long[] {0, 200, 100, 200});
        nm.createNotificationChannel(alert);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void goForeground(String text) {
        Notification n = new NotificationCompat.Builder(this, CH_RUNNING)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("巴士到站")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp())
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(ONGOING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(ONGOING_ID, n);
        }
    }

    private void alert(Reminder r, String title) {
        Notification n = new NotificationCompat.Builder(this, CH_ALERT)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(r.stopName)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(openApp())
                .build();
        getSystemService(NotificationManager.class).notify(r.key.hashCode(), n);
    }

    private void finish() {
        handler.removeCallbacks(tick);
        if (wake.isHeld()) wake.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (wake.isHeld()) wake.release();
        thread.quitSafely();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
