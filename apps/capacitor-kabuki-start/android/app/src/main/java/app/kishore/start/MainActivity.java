package app.kishore.start;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Before super.onCreate, which builds the bridge and loads the page.
        registerPlugin(ShellBars.class);
        super.onCreate(savedInstanceState);
    }
}
