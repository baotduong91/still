# A quiet beginning on this device

An empty device opens an in-page welcome on Today or Journey after state hydration, when `plans.length === 0`, `activeId` is empty, and `journeyOnboarding.completedAt` is absent. Existing journeys skip the welcome even when these new optional fields are missing. `setupSeen` alone does not indicate that a journey was created. Create, Settings, public WEB reading, and other screens remain available. The existing PIN boundary wraps the welcome too.

The welcome combines a short privacy introduction, native radio choices from the reviewed themes (plus John 3:16), and a real starter preview. **Begin my journey** saves that exact preview as the active plan, marks onboarding complete and `setupSeen=true`, then opens Today Day 1. It is one local, atomic state save: no AWP plan request, model, account, or API.Bible access is used. Scripture is exact local WEB, retrieved and validated through the existing guided pipeline. Model and online-edition preferences remain explicit Settings choices.

**Customize in Create** records `dismissedWelcome` and opens an empty Create form without making a plan. This flag records the route choice; it does not mark onboarding complete. Returning to an empty Today or Journey offers the welcome again.

## Anonymous device profile

The provider measures viewport breakpoints with `matchMedia` after hydration and a 120 ms debounce: mobile up to 720px, tablet up to 1024px, desktop above 1024px. It stores the first measurement once. Mobile/tablet starters have five gentle days; desktop starters have seven. Later window resizing does not change the saved form factor or a journey’s length. The mobile welcome includes a one-time sharing hint; Create Image keeps its existing Story default.

`deviceProfile` contains a `crypto.randomUUID()` ID, `createdAt`, first `formFactor`, and three-way `starterVariant` (UUID modulo 3). The selected `starterIntent` is saved when the user begins. Copy variants change the welcome sentence only; they are not analytics experiments. No names, locale/timezone, fingerprinting, IP lookup, or device attributes beyond the viewport category are collected. The profile stays in the existing `still-private` IndexedDB state and its localStorage write-ahead record. It is never put into URLs, logs, AWP requests, model calls, or telemetry. The existing explicit local backup export includes it with the rest of the saved state.

There is no extra onboarding network service. The app still fetches its static shell and local WEB corpus on initial installation and registers its existing offline service worker. After installation those files and new starters work offline. Today’s existing text-free TTS warmup and optional, previously downloaded Bella preparation remain separate from onboarding.

## Start fresh

Settings → **Start fresh on this device** opens an inline confirmation. **Keep my journeys** cancels. Confirming removes local plans and their Practice responses, active plan, remote plan IDs, pending plan-sync jobs, and onboarding completion. It creates a new anonymous profile from the current viewport and opens the welcome again. Journal entries, notes, highlights, PIN, guide/translation/theme preferences, and offline WEB/voice downloads are retained. Export before resetting to keep a copy of journeys. This action does not delete any separately stored server-side AWP plans.

The migration merges missing fields into defaults without replacing saved plans or preferences. Device identity is initialized once and saved through the same write-ahead mechanism; no IndexedDB schema/version change is required. Storage failures leave the welcome available to retry rather than navigating to an unsaved plan.

## Checks

Unit tests cover each intent’s validated WEB plan, day-count defaults, stable copy variants, trigger conditions, and both IndexedDB and write-ahead migration. Clean-browser tests cover no onboarding API traffic, Day 1 and reload, mobile/desktop themes and accessibility, Customize, confirmed reset with PIN/journal retention, and offline reference starts. Existing feature regressions explicitly seed a returning user with a real AWP-created plan, preserving remote completion/sync coverage independently of first-run onboarding.
