# Optional PIN screen lock

Use Settings → PIN privacy to choose and confirm 6–12 digits. The feature works on HTTPS hosted deployments and on localhost. It applies only to this browser profile/device; repeat setup separately on another device. There is no biometric dependency.

The lock screens Today, plans, Create, Journal, chat, personal Scripture notes/highlights, Settings, and browser export controls. It locks on reload, when the app becomes hidden or navigates away, after five minutes without pointer/keyboard activity, and with Lock/Lock now. The protected UI is not rendered while locked. Enter the correct PIN to reopen it. Five wrong attempts trigger a one-minute UI cooldown. Changing or disabling the PIN requires an already unlocked Settings screen.

The separate `/read` route remains available while locked and displays only the public-domain WEB Bible. It has no personal notes, highlights, journal content, model calls, or online licensed editions. Download for offline includes this public reader.

## What it protects

This is a screen privacy gate for casual access on shared/mobile devices. It is **not encryption, a server password, or account authentication**. Sensitive browser data is still stored unencrypted in IndexedDB and the short-lived write-ahead recovery record. Someone with browser developer tools, device access, a browser backup, or existing authenticated API access can bypass this UI gate. AWP endpoints continue to use their existing session/bearer principal and are not protected by this device PIN. Hosted deployments needing adversarial access protection must use server authentication and appropriate storage encryption in addition to device security.

The PIN itself is not stored. A random 16-byte salt and PBKDF2-SHA-256 verifier (210,000 iterations) are stored with preferences. Unlock state is held only in memory, so a reload locks again. The wrong-attempt cooldown is also in-memory and is not an anti-brute-force security boundary. Use a distinct PIN and do not reuse a sensitive banking/device code.

There is no PIN recovery or bypass button. Before enabling it, keep a private data export if needed. Clearing this site's browser storage resets the PIN **and removes local plans, notes, prayers, and journal data**; server records follow the existing session rules and are not automatically restored. Exported files are not PIN-protected. Chat conversations remain temporary and are cleared when their screen unmounts, including on lock.

## Practice and mobile behavior

The Today Practice step has a private response field. Save my response stores it with that plan/day on the device; Complete today first saves it, then records completion. Remote completion refreshes preserve locally written Practice responses. These responses are not automatically sent to cloud, Ollama, API.Bible, or the server, and remain readable after reload/offline. The browser JSON export includes saved responses. Save explicitly before leaving the page; unsaved input is not retained across a screen lock or navigation.

Phone layouts provide larger step/day controls, 16px writing fields, a sticky chat composer above the bottom navigation, and a single-column Create form with a reachable submit action. First-run guidance and Settings anchors make answer mode, Bible editions, and PIN privacy easy to locate.
