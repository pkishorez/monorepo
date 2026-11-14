package app.kishore.start;

import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Keeps the web view between the system bars and paints the bars in the
 * page's theme-color, as a browser does. The page stays full-screen and
 * unaware: its env(safe-area-inset-*) are zero and it calls nothing here.
 *
 * Capacitor's own SystemBars is turned off (insetsHandling: disable in
 * capacitor.config.js): the site asks for viewport-fit=cover, and on WebView
 * 140 and later SystemBars then hands the insets to the page instead of
 * keeping the web view out of the bars.
 *
 * It is a plugin, with no methods, only because a plugin's load() is the one
 * hook between the web view's creation and its first page load, which is
 * when a JavaScript interface has to be added.
 */
@CapacitorPlugin(name = "ShellBars")
public class ShellBars extends Plugin {

    private static final String TAG = "ShellBars";

    // Android's web view has no themeColor: this watches the tag and reports
    // it, as #rrggbb, whenever the page sets or changes it. A canvas turns
    // any CSS color into sRGB.
    private static final String WATCH_THEME_COLOR = """
        (function () {
          if (window.__shellBars) return 'already watching';
          if (typeof ShellBarsAndroid === 'undefined') return 'no ShellBarsAndroid';
          if (!document.documentElement) return 'no document yet';
          var last = null;
          function themeColor() {
            var metas = document.querySelectorAll('meta[name="theme-color"]');
            for (var i = 0; i < metas.length; i++) {
              var media = metas[i].getAttribute('media');
              if (!media || matchMedia(media).matches) return metas[i].getAttribute('content');
            }
            return null;
          }
          function report() {
            var css = themeColor();
            if (!css || css === last || !CSS.supports('color', css)) return;
            last = css;
            var canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            var context = canvas.getContext('2d');
            context.fillStyle = css;
            context.fillRect(0, 0, 1, 1);
            var rgb = context.getImageData(0, 0, 1, 1).data;
            var hex = '#';
            for (var c = 0; c < 3; c++) hex += ('0' + rgb[c].toString(16)).slice(-2);
            ShellBarsAndroid.setColor(hex);
          }
          new MutationObserver(report).observe(document.documentElement, {
            subtree: true, childList: true, attributes: true,
            attributeFilter: ['content', 'media', 'name']
          });
          window.__shellBars = true;
          report();
          return 'watching';
        })();
        """;

    /** The site's dark Theme, its default, until the page names its color. */
    private int color = Color.parseColor("#0a0a0a");
    private Insets bars = Insets.NONE;
    private String lastReport = "";
    private WebViewListener watcher;

    @Override
    public void load() {
        getBridge().getWebView().addJavascriptInterface(new Channel(), "ShellBarsAndroid");

        Window window = getActivity().getWindow();
        // Android 15 makes the bars see-through; this keeps 3-button
        // navigation from adding a scrim of its own on top.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            bars = insets.getInsets(types);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, keyboard ? Math.max(ime.bottom, bars.bottom) : bars.bottom);
            report();
            // Zero, not consumed: the web view still needs to hear about
            // changes (https://issues.chromium.org/issues/461332423).
            return new WindowInsetsCompat.Builder(insets).setInsets(types, Insets.NONE).build();
        });
        decor.post(this::paint);
    }

    // Not in load(): Capacitor's Bridge.Builder replaces the bridge's list of
    // web view listeners after the plugins have loaded, so one added there is
    // dropped. SystemBars waits for start too.
    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        if (watcher != null) return;
        watcher = new WebViewListener() {
            // The earliest the page's head is there; and again once it has
            // loaded, in case the first came too early.
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                watch(view);
            }

            @Override
            public void onPageLoaded(WebView view) {
                watch(view);
            }
        };
        getBridge().addWebViewListener(watcher);
        // The first page may be under way already.
        watch(getBridge().getWebView());
    }

    private void watch(WebView view) {
        view.evaluateJavascript(WATCH_THEME_COLOR, (result) -> Log.i(TAG, "theme-color script: " + result + " on " + view.getUrl()));
    }

    // SystemBars repaints the window from the theme on a configuration
    // change (night mode, rotation); paint again after it.
    @Override
    protected void handleOnConfigurationChanged(android.content.res.Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        getActivity().getWindow().getDecorView().post(this::paint);
    }

    private void paint() {
        Window window = getActivity().getWindow();
        View decor = window.getDecorView();
        decor.setBackgroundColor(color);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        boolean light = isLight(color);
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
        report();
    }

    /** One logcat line whenever the bars change, which CI reads. */
    private void report() {
        String line = String.format(
            Locale.US,
            "{\"top\":%d,\"bottom\":%d,\"left\":%d,\"right\":%d,\"color\":\"#%06x\",\"lightBars\":%b}",
            bars.top,
            bars.bottom,
            bars.left,
            bars.right,
            color & 0xffffff,
            isLight(color)
        );
        if (line.equals(lastReport)) return;
        lastReport = line;
        Log.i(TAG, "[native-shell] " + line);
    }

    /** Light enough for dark icons: WCAG's relative luminance above one half. */
    private static boolean isLight(int color) {
        double luminance =
            0.2126 * linear(Color.red(color)) + 0.7152 * linear(Color.green(color)) + 0.0722 * linear(Color.blue(color));
        return luminance > 0.5;
    }

    private static double linear(int channel) {
        double value = channel / 255.0;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }

    /** What the page's script reaches as ShellBarsAndroid. */
    private class Channel {

        // Any page in the web view can call this, so it takes only #rrggbb
        // and can do no more than recolor the bars.
        @JavascriptInterface
        public void setColor(String hex) {
            if (hex == null || !hex.matches("#[0-9a-fA-F]{6}")) return;
            int parsed = Color.parseColor(hex);
            getBridge().executeOnMainThread(() -> {
                color = parsed;
                paint();
            });
        }
    }
}
