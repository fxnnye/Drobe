import UIKit
import WebKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        JawnzPush.shared.attach()
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        JawnzPush.shared.gotToken(deviceToken.map { String(format: "%02x", $0) }.joined())
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        JawnzPush.shared.send("onError", error.localizedDescription)
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Brücke für Push-Mitteilungen: die Web-App fragt über window.webkit.messageHandlers.jawnzPush, die App antwortet über window.JawnzPush.
final class JawnzPush: NSObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    static let shared = JawnzPush()
    private var attached = false
    private var token: String?
    private var pendingLink: String?
    #if DEBUG
    private let env = "sandbox"
    #else
    private let env = "production"
    #endif

    private func bridgeWebView() -> WKWebView? {
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            for w in ws.windows {
                if let vc = w.rootViewController as? CAPBridgeViewController, let wv = vc.webView { return wv }
            }
        }
        return nil
    }

    func attach() {
        guard !attached, let wv = bridgeWebView() else { return }
        wv.configuration.userContentController.add(self, name: "jawnzPush")
        UNUserNotificationCenter.current().delegate = self
        // Tastatur: der Browser in der App meldet die Höhe nicht, deshalb meldet sie iOS selbst an die Seite
        NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { [weak self] n in
            guard let f = n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            let screenH = UIScreen.main.bounds.height
            let h = f.minY >= screenH ? 0 : Int(screenH - f.minY)
            self?.js("window.JawnzKB && window.JawnzKB(\(h))")
        }
        NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] _ in
            self?.js("window.JawnzKB && window.JawnzKB(0)")
        }
        attached = true
    }

    private func js(_ code: String) {
        DispatchQueue.main.async { self.bridgeWebView()?.evaluateJavaScript(code, completionHandler: nil) }
    }

    func send(_ fn: String, _ args: String...) {
        let list = args.map { "\"" + $0.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }.joined(separator: ",")
        js("window.JawnzPush && window.JawnzPush.\(fn) && window.JawnzPush.\(fn)(\(list))")
    }

    func gotToken(_ t: String) {
        token = t
        send("onToken", t, env)
    }

    private func reportStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let v: String
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral: v = "authorized"
            case .denied: v = "denied"
            default: v = "notDetermined"
            }
            self.send("onStatus", v)
            if v == "authorized" { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "status", "register":
            if let t = token { send("onToken", t, env) }
            reportStatus()
        case "enable":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in self.reportStatus() }
        case "ready":
            if let l = pendingLink { pendingLink = nil; send("onOpen", l) }
        case "haptic":
            let kind = (body["kind"] as? String) ?? "light"
            DispatchQueue.main.async {
                switch kind {
                case "select": UISelectionFeedbackGenerator().selectionChanged()
                case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
                case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
                case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
        case "badge":
            let n = (body["count"] as? Int) ?? 0
            DispatchQueue.main.async { UIApplication.shared.applicationIconBadgeNumber = n }
        default: break
        }
    }

    // Mitteilung kommt an, während die App offen ist: trotzdem kurz einblenden
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    // Antippen einer Mitteilung: die Web-App öffnet die passende Ansicht
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let link = (response.notification.request.content.userInfo["link"] as? String) ?? "messages"
        pendingLink = link
        send("onOpen", link)
        completionHandler()
    }
}
