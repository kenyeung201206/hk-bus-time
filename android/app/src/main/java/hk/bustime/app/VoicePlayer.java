package hk.bustime.app;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.ArrayDeque;

/**
 * Plays the recorded Cantonese clips (assets/public/voice/<voice>/<clip>.mp3) one after
 * another. Each clip asks Android for "transient, may duck" audio focus — the same way
 * Google Maps navigation talks — so YouTube / Facebook Live get quieter while it speaks
 * and come back afterwards. Works with the screen off (called from ReminderService).
 */
public final class VoicePlayer {
    private static final String TAG = "VoicePlayer";
    private static VoicePlayer instance;

    private final Context ctx;
    private final AudioManager audio;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<String> queue = new ArrayDeque<>();
    private MediaPlayer player;
    private AudioFocusRequest focus;

    private VoicePlayer(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.audio = (AudioManager) this.ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    public static synchronized VoicePlayer get(Context ctx) {
        if (instance == null) instance = new VoicePlayer(ctx);
        return instance;
    }

    /** Queue a clip, e.g. play("wanlung", "m7") or play("hiugaai", "arrived"). */
    public void play(String voice, String clip) {
        String v = ("hiugaai".equals(voice) || "wanlung".equals(voice) || "kid".equals(voice)) ? voice : "hiugaai";
        String path = "public/voice/" + v + "/" + clip + ".mp3";
        main.post(() -> {
            queue.add(path);
            if (player == null) next();
        });
    }

    private void next() {
        String path = queue.poll();
        if (path == null) {
            release();
            return;
        }
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        if (focus == null) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(change -> { })
                    .build();
            audio.requestAudioFocus(focus);
        }
        try (AssetFileDescriptor fd = ctx.getAssets().openFd(path)) {
            player = new MediaPlayer();
            player.setAudioAttributes(attrs);
            player.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            player.setOnCompletionListener(mp -> {
                mp.release();
                player = null;
                next();
            });
            player.setOnErrorListener((mp, what, extra) -> {
                mp.release();
                player = null;
                next();
                return true;
            });
            player.prepare();
            player.start();
        } catch (Exception e) {
            Log.w(TAG, "cannot play " + path, e);
            if (player != null) player.release();
            player = null;
            next();
        }
    }

    private void release() {
        if (focus != null) {
            audio.abandonAudioFocusRequest(focus);
            focus = null;
        }
    }
}
