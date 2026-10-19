package hk.bustime.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge: window.Capacitor.Plugins.BusReminder.start / stop / speak (see src/alerts/native.ts). */
@CapacitorPlugin(name = "BusReminder")
public class BusReminderPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        askNotificationPermission();
        JSObject data = call.getData();
        Intent i = new Intent(getContext(), ReminderService.class)
                .setAction(ReminderService.ACTION_START)
                .putExtra("reminder", data.toString());
        ContextCompat.startForegroundService(getContext(), i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String key = call.getString("key");
        Intent i = new Intent(getContext(), ReminderService.class)
                .setAction(ReminderService.ACTION_STOP)
                .putExtra("key", key);
        try {
            ContextCompat.startForegroundService(getContext(), i);
        } catch (Exception ignored) {
            // service not running: nothing to stop
        }
        call.resolve();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String voice = call.getString("voice", "hiugaai");
        String clip = call.getString("clip", "intro");
        VoicePlayer.get(getContext()).play(voice, clip);
        call.resolve();
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED
                && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }
}
