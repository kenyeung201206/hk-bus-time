package hk.bustime.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // native reminder service: speaks the Cantonese reminders with the screen locked
        registerPlugin(BusReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
