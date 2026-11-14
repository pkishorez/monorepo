import UIKit
import WebKit
import Capacitor

/// The app's root: Capacitor's view controller as a child, its web view kept
/// inside the safe area, and the bars around it painted in the page's
/// theme-color, as Safari does. The page stays full-screen and unaware: its
/// env(safe-area-inset-*) are zero, because the web view never reaches the
/// clock, the Dynamic Island or the home indicator.
///
/// Capacitor's loadView is final and makes the web view the whole view, so
/// the only way to inset it is from outside.
class ShellViewController: UIViewController {
    let bridgeViewController = CAPBridgeViewController()

    /// The site's dark Theme, its default, until the page names its color:
    /// no white flash on launch.
    private var barColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 10 / 255, alpha: 1)
    private var themeColorObservation: NSKeyValueObservation?
    private var lastReport = ""

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = barColor

        addChild(bridgeViewController)
        // Loads Capacitor's web view and starts the page.
        let page: UIView = bridgeViewController.view
        page.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(page)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            page.topAnchor.constraint(equalTo: safe.topAnchor),
            page.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            page.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            page.trailingAnchor.constraint(equalTo: safe.trailingAnchor)
        ])
        bridgeViewController.didMove(toParent: self)

        // WebKit keeps themeColor in step with <meta name="theme-color">,
        // including the site's in-place switches when the Theme changes.
        themeColorObservation = bridgeViewController.webView?.observe(\.themeColor, options: [.initial, .new]) { [weak self] webView, _ in
            guard let color = webView.themeColor else { return }
            self?.paint(color)
        }
    }

    private func paint(_ color: UIColor) {
        barColor = color
        view.backgroundColor = color
        setNeedsStatusBarAppearanceUpdate()
        report()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        report()
    }

    /// One line on the app's output whenever the bars change, which CI reads
    /// to find the bars in a screenshot and the color they should have.
    private func report() {
        let scale = view.window?.screen.scale ?? UIScreen.main.scale
        let insets = view.safeAreaInsets
        let line = """
        {"top":\(Int(insets.top * scale)),"bottom":\(Int(insets.bottom * scale)),\
        "webViewTop":\(Int(bridgeViewController.view.frame.minY * scale)),\
        "color":"\(hex(barColor))","lightBars":\(isLight(barColor))}
        """
        guard line != lastReport else { return }
        lastReport = line
        print("[native-shell] \(line)")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        isLight(barColor) ? .darkContent : .lightContent
    }

    // The rest is asked of the root, so it goes to Capacitor's controller as
    // if it still were the root: hiding the bars, the home indicator and the
    // orientations in Info.plist.
    override var childForStatusBarHidden: UIViewController? { bridgeViewController }
    override var childForHomeIndicatorAutoHidden: UIViewController? { bridgeViewController }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        bridgeViewController.supportedInterfaceOrientations
    }
}

private func components(_ color: UIColor) -> (CGFloat, CGFloat, CGFloat) {
    var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
    color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
    return (min(max(red, 0), 1), min(max(green, 0), 1), min(max(blue, 0), 1))
}

/// Light enough for dark icons: WCAG's relative luminance above one half.
private func isLight(_ color: UIColor) -> Bool {
    let linear = { (value: CGFloat) -> CGFloat in
        value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }
    let (red, green, blue) = components(color)
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue) > 0.5
}

private func hex(_ color: UIColor) -> String {
    let (red, green, blue) = components(color)
    return String(format: "#%02x%02x%02x", Int(round(red * 255)), Int(round(green * 255)), Int(round(blue * 255)))
}
