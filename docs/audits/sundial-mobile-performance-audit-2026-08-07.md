# Sundial Mobile Performance Audit

Date: 2026-08-07  
Audited revision: `720a9ab47670ca6401dbd8d92f87fa6fce54e4f8` (`main`)  
Live tenant used for non-destructive measurements: `https://davids.sundialk12.com/app`  
Mobile viewport used for browser automation: 390 x 844

## Executive Summary

Overall assessment: **MOSTLY HEALTHY, WITH IMPORTANT DEVICE-MEASUREMENT GAPS**.

The source architecture contains strong leak-prevention mechanisms: persistent listeners and timers have matching cleanup, snapshot requests are deduplicated, foreground triggers are coalesced, route refreshes are serialized, IndexedDB uses one shared connection promise, and there are no mobile-app Supabase realtime/auth subscriptions. A focused 64-test lifecycle/swipe/startup suite passed.

The live production DOM stabilized at 247 nodes and remained exactly there at 0 seconds, 30 seconds, 60 seconds, and 5 minutes idle. After 20 verified Home -> Calendar -> Events -> Athletics -> More -> Home cycles, Home still returned to 247 nodes with one route `<main>`, one startup boundary, one bottom navigation, two images, and no dialog. This is good evidence against duplicated live route trees, accumulating overlays, and obvious DOM growth.

It is **not** proof that the JavaScript heap or total WebKit process footprint is stable. The automated browser surface did not expose reliable heap, detached-node, CPU, or process-memory metrics, and no attached-iPhone Safari/Web Inspector capture was available. Those values are deliberately reported as unavailable rather than estimated.

Home idle memory: **not measured on iPhone; no reliable number available**.  
Memory after navigation stress: **not measured; DOM/resource-instance shape returned to baseline**.  
Memory after foreground/background stress: **not measured on a physical device**.  
Confirmed client memory leaks: **none**.  
Potential client memory leaks: **none proven**.  
Largest memory-pressure concern: **a 3425 x 3425 school logo displayed at 36 x 36**. A full RGBA decode is approximately 44.75 MiB, although WebKit may downsample or purge decoded image data.  
CPU idle behavior: **not directly sampled**; Home intentionally rerenders `AppScheduleDashboard` once per second.  
Recurring network behavior: one snapshot refresh every 5 minutes while visible and one PWA update check every 15 minutes while visible, plus lifecycle-triggered refreshes. No few-second polling was found.

### Most important answer

**NOT ENOUGH EVIDENCE YET.**

There is no source, unit-test, or live-DOM evidence that Sundial continually accumulates resources during ordinary tab navigation or five minutes of Home idling. However, the requested conclusion concerns long-lived installed-PWA memory on iOS. It cannot be proven without repeated heap/process measurements on an attached iPhone, especially across background/foreground cycles. The exact device protocol is included below.

## Evidence Boundaries

| Evidence class | What was completed | What it can establish |
|---|---|---|
| Live production automation | 390 x 844 viewport, launch/Home inspection, 5-minute idle observation, 20 verified navigation cycles, image dimensions | DOM stability, route-instance shape, visible behavior, image decode inputs |
| Network probes | Repeated HTTPS timings and compressed transfer sizes | Server/transfer baseline, payload size, request cadence inferred from source |
| Source audit | Mobile layouts, startup, swipe, service worker, sync, IndexedDB, effects, timers, listeners, images, Supabase | Ownership, cleanup, overlap/deduplication, bounded/unbounded structures |
| Automated tests | 64 focused tests | Coalescing, disposal, startup and swipe contracts under simulated lifecycle events |
| Estimates | Snapshot scale and decoded-image upper bound | Relative risk, not actual WebKit memory |
| Not available in this run | Safari Memory/CPU timelines, heap snapshots, retaining paths, jetsam/process footprint, real backgrounding | Required to confirm or exclude retained-heap/process leaks on iPhone |

## Current Architecture and Lifetime Ownership

### Launch-to-Home sequence

1. `src/app/layout.tsx` emits theme and launch prepaint scripts, inline critical launch CSS, the launch mark preload, matching iOS startup-image declarations, and the server-rendered launch screen.
2. The root layout mounts `ServiceWorkerRegister` and a root `ThemeRouteSync` for the document lifetime.
3. `src/app/[school]/layout.tsx` resolves lifecycle/tenant/public-site data before rendering the tenant wrapper.
4. `src/app/[school]/app/layout.tsx` resolves the mobile school, quick links, theme tokens, manifest/canonical metadata, and mounts the lifetime mobile shell.
5. `PwaStartupBoundary` mounts `OfflineSchoolDataProvider`; cache hydration and audience selection decide the startup destination. Audience reconciliation runs in the background and does not gate a locally known destination.
6. The launch handoff waits for the chosen destination, any route fallback, and two animation frames, with bounded timeout fallbacks. Its `MutationObserver`, animation frames, and timers are disconnected/cancelled.
7. `OfflineSchoolDataProvider` loads one tenant snapshot from IndexedDB, then launches a deduplicated network refresh.
8. The Home server component resolves today's calendar day, schedule, and periods. Only `AppScheduleDashboard` owns the once-per-second clock.
9. The launch element is removed after the stable destination paints.

### Components that stay mounted for the mobile app session

- Root `ServiceWorkerRegister`
- Root `ThemeRouteSync`
- Tenant layout wrapper
- App-level `PwaStartupBoundary` / `StartupCoordinator`
- `OfflineSchoolDataProvider`
- App-level `ThemeRouteSync`
- `AppHeader` and the closed-state `NotificationDrawer`
- `AppSwipeNavigation`
- `SchoolDataRefreshCoordinator` / `OfflineStudentAppRuntime`
- `AppRoutePrefetch`
- `AppBottomNav`

Route pages are replaced under `AppSwipeNavigation`; the swipe component does not cache old React page trees. Next.js may retain finite prefetched/RSC route data in its router cache, but the live DOM did not retain multiple page roots.

The utilities and notification drawer components remain addressable from the header, but their portal DOM and drawer contents are not rendered while closed. The utilities dialog returned to zero live instances after every measured cycle.

## Baseline Measurements

### Production document and payload timing

Five direct compressed requests per route produced these ranges:

| Route | TTFB range | Complete response range | Compressed HTML |
|---|---:|---:|---:|
| Home | 283-392 ms | 0.921-1.432 s | 14.5-14.6 KiB |
| Calendar | 273-300 ms | 0.867-1.072 s | 18.8-19.6 KiB |
| Events | 282-462 ms | 0.705-1.495 s | 13.3-13.4 KiB |
| Athletics | 277-581 ms | 0.724-1.055 s | 14.6 KiB |

The Home HTML referenced 17 static JS/CSS assets totaling approximately 294.7 KiB compressed: 269.2 KiB JavaScript and 25.5 KiB CSS. The launch mark was 23.7 KiB. These are transfer measurements, not JavaScript execution or decoded-memory measurements.

The offline snapshot endpoint returned:

- 8.9 KiB compressed over the network
- 51.0 KiB decoded JSON
- 243 current data rows: 2 schedules, 9 periods, 218 calendar days, 2 announcements, 2 events, 3 resources, 2 sports, 2 teams, and 2 games
- approximately 1.16-1.65 seconds in two direct samples; server/database latency dominates this background request

### Startup metrics not available

The following could not be measured reliably in this run: first visual, first contentful paint, hydration duration, long-task time, JavaScript execution time, JavaScript heap, and total page/process memory. The application already records a startup timeline relative to navigation start, but the browser control surface exposed only the console label, not the structured payload.

The observed roughly two-second iPhone black interval must remain split into:

- **A. Before WebKit exposes/paints the document:** not observable from page JavaScript.
- **B. After navigation start:** measurable with Safari Web Inspector. Current production response timing shows that document delivery can consume roughly 0.9-1.4 seconds end-to-end in direct probes, but that does not establish when WebKit can first paint the inline launch surface.

## Home Idle Results

| Checkpoint | DOM nodes | `<main>` | Bottom nav | Dialogs | Images | Startup boundaries |
|---|---:|---:|---:|---:|---:|---:|
| Settled Home | 247 | 1 | 1 | 0 | 2 | 1 |
| 30 seconds | 247 | 1 | 1 | 0 | 2 | 1 |
| 60 seconds | 247 | 1 | 1 | 0 | 2 | 1 |
| 5 minutes | 247 | 1 | 1 | 0 | 2 | 1 |

Body text length also remained constant at 52,106 characters. This includes framework/script text and is useful only as a stability signal.

No continual DOM growth was observed. JavaScript heap, detached nodes, listener counts, timer counts, CPU, and total process memory were unavailable in the automated browser and require Safari Web Inspector.

Home is not computationally silent: `AppScheduleDashboard` updates local `now` state every second and rerenders that dashboard. The server Home component, header, bottom navigation, and full page tree are not driven by that clock state.

## Navigation and Swipe Stress Results

The verified sequence was Home -> Calendar -> Events -> Athletics -> open More/utilities -> close More -> Home. It ran 20 times.

| Cycle | Final route | DOM nodes | `<main>` | Navs | Dialogs | Images | Startup boundaries |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Home | 247 | 1 | 1 | 0 | 2 | 1 |
| 5 | Home | 247 | 1 | 1 | 0 | 2 | 1 |
| 10 | Home | 247 | 1 | 1 | 0 | 2 | 1 |
| 20 | Home | 247 | 1 | 1 | 0 | 2 | 1 |

No multiple Home, Calendar, Events, or Athletics DOM trees were present at the final checkpoints. No dialogs accumulated. `AppSwipeNavigation` maintains only primitive drag data and a single gesture ref; it does not hold page elements or page-component references. Pointer capture is released on pointer end and on direct tab navigation. Its pathname-scoped custom-event listener is removed with the exact callback reference before re-registration.

Six of 20 artificially rapid cycles needed a second Home activation after closing More (cycles 4, 8, 12, 15, 16, and 18). The destination-verified harness waited for the drawer close before activation and then retried once. This did not produce duplicate DOM, but it should be repeated with real touch input on iPhone before being dismissed as automation timing.

The run did not emulate real touch `pointerType`, partial/cancelled swipes, or pointer capture on iOS. The source contract for stale drag reset passed, but physical swipe stress remains required.

## Foreground / Background Results

No physical iPhone background/foreground run was available. The automated browser could not safely change the page's actual visibility state, so no memory numbers are reported.

Source and test evidence is favorable:

- PWA update signals from `visibilitychange`, `pageshow`, `focus`, and `online` are coalesced into one foreground cycle.
- PWA update calls do not overlap (`checkInFlight`).
- Snapshot foreground/online/midnight signals coalesce for 250 ms.
- Snapshot refreshes are serialized; one extra run may be queued, but concurrent runs do not accumulate.
- App-update checks and data-route refreshes coordinate so they do not race a pending reload.
- Disposing either lifecycle removes its listeners and clears pending, follow-up, midnight, reload, and interval timers.
- The 64 focused tests include foreground coalescing, non-overlap, listener/timer disposal, consecutive midnights, update/reload guards, and swipe reset.

This establishes design intent and regression coverage, not real WebKit heap stability across 20 resumes.

## Heap and Detached-DOM Analysis

No heap snapshots or retaining paths were available. Therefore:

- detached Home/Calendar/Events/Athletics trees were not measured;
- closure-retaining paths were not measured;
- garbage-collection return-to-baseline was not measured;
- no leak is claimed or excluded solely from DOM counts.

The 20-cycle stable live DOM is evidence against visibly retained duplicate page trees, but only Safari JavaScript Allocation snapshot comparisons can establish whether detached React/DOM objects remain reachable.

## Event Listener Results

The table covers app-session or route-relevant external registrations. React's delegated event system is excluded.

| Listener | Owner | Registration lifecycle | Cleanup | Risk/evidence |
|---|---|---|---|---|
| Media query `change` | Root and app `ThemeRouteSync` | Two listeners on app routes; re-created on pathname change | Exact callback removed | No leak; duplicate theme work is real |
| `updatefound` | PWA update lifecycle | Once after SW registration | Exact callback removed | Low risk |
| SW `controllerchange`, `message` | PWA update lifecycle | Once per root lifecycle | Exact callbacks removed | Low risk |
| `visibilitychange`, `pageshow`, `focus`, `online` | PWA update lifecycle | Once per root lifecycle | Exact callbacks removed | Coalesced; low risk |
| `visibilitychange`, `online`, `offline` | School refresh lifecycle | Once per coordinator instance; coordinator reinitializes once when startup becomes ready | Exact callbacks removed and timers cleared | No duplicate accumulation found in tests |
| Custom inbox-change event | `AppHeader` | Once per header lifetime | Exact callback removed | Low risk |
| Custom tab-pending event | `AppBottomNav` | Once per bottom-nav lifetime | Exact callback removed | Low risk |
| Custom direct-navigation event | `AppSwipeNavigation` | Pathname-scoped | Exact callback removed | No listener accumulation; unnecessary churn only |
| `popstate` | `CalendarScheduleClient` | Only while Calendar is mounted | Exact callback removed | Low risk |
| `keydown`, `popstate` | `OverlayDrawer` | Only while an applicable drawer is open | Exact callbacks removed | Dialog count returned to zero |
| Notification dialog `keydown` | Inbox/detail confirmation | Only while dialog is mounted | Exact callback removed | Low risk |
| Service worker `statechange` | Installing worker observer | Once per observed worker through a `WeakSet` | Not explicitly removed | Small closure may live with the current worker; not navigation/resume-driven and not a confirmed leak |

React Strict Mode may mount, clean, and remount effects in development. The exact-reference cleanup patterns above are compatible with that behavior.

## Timer Results

| Timer | Cadence/lifetime | Duplication protection | Cleanup / background behavior |
|---|---|---|---|
| Home schedule clock | 1 second while Home dashboard is mounted | Route-local single effect | Cleared on unmount; does not check visibility and relies on browser throttling |
| Calendar schedule clock | 1 second while Calendar client is mounted | Route-local single effect | Cleared on unmount; rerenders the calendar client |
| Snapshot refresh interval | 5 minutes for app provider lifetime | Stable `refresh` callback and provider effect | Cleared on unmount; callback skips refresh while hidden |
| Midnight refresh | One timeout rescheduled after firing | Lifecycle owns one ID | Cleared on dispose; school-timezone aware |
| PWA update interval | 15 minutes for root lifecycle | One lifecycle instance | Cleared on dispose; callback skips work while hidden |
| Foreground coalesce/follow-up | 200 ms / 1 second after a foreground cycle | One active cycle and one timer of each type | Cleared on dispose |
| Startup handoff | Two animation frames plus 300 ms fallback; route/cache fail-safes | One-shot refs/guards | Observer, frames, and timeouts cleaned |
| Drawer animation/focus | 0-260 ms | Short lived | Primary timers/frames cleaned; a few zero/260 ms state/focus timers are not stored but cannot recur autonomously |

No recurring `requestAnimationFrame` loop exists. No five-minute interval is created on foreground; foreground uses the separate coalesced lifecycle. The source does not support the failure mode of five intervals after five resumes.

## Sync Architecture Results

Launch, foreground, online, midnight, periodic, and manual/context refreshes converge on `OfflineSchoolDataProvider.refresh()`.

- `syncingRef` returns the existing provider-level promise.
- `inFlightSyncs` returns the existing request-level promise by tenant ID/slug.
- Both references are cleared in `finally`.
- Foreground lifecycle permits at most one in-flight operation and one queued rerun.
- Foreground and online triggers within 250 ms coalesce.
- Route refresh occurs only when data changed, status is non-current, or midnight requires a date rollover.
- Route refresh is skipped offline, with unsaved work, before startup readiness, or while an application update is pending.
- Failed promises are removed from deduplication maps.

There is no cancellation for a snapshot fetch after provider unmount. State writes are gated by `mountedRef`, and the promise/map entry clears when the request settles. A stalled browser fetch can therefore retain its response chain transiently, but it does not create one request per foreground event.

Snapshot comparison serializes `current.data` and `next.data`. This is O(n) and creates temporary strings every successful sync, but current payloads are small and refresh cadence is low.

## IndexedDB Results

- One database: `sundial-offline`, version 1.
- Two stores: `schoolSnapshots` and `syncMetadata`.
- One module-level `dbPromise` reuses the database connection.
- Each request creates a short transaction; request and transaction error paths reject.
- One full snapshot for the active tenant is loaded into React state and intentionally retained for offline failover, even though Home needs only a small subset.
- Snapshots are keyed by school ID, so multiple tenants can coexist on disk. Only the active tenant snapshot is admitted to context.
- The connection has no `versionchange` close handler. This can complicate a future schema upgrade across tabs, but it is not a current connection leak.

The live snapshot was 51 KiB serialized. Estimates based on live average row sizes and current endpoint caps:

| Profile | Rows | Estimated serialized snapshot data |
|---|---:|---:|
| Current/small | 243 | 48.7 KiB |
| Typical synthetic | 731 | 151.2 KiB |
| Large synthetic | 1,391 | 295.9 KiB |

JavaScript object graphs require more memory than serialized JSON, and a refresh transiently holds current and incoming snapshots plus comparison strings. Even allowing several multiples of these estimates, snapshot data is unlikely to dominate the observed image decode risk at current caps.

## Supabase Results

The mobile PWA has no browser Supabase client, realtime channel, auth-state subscription, or database subscription. Mobile route data is server-rendered; offline refresh and notification inbox use HTTP endpoints.

Browser Supabase clients exist in login/admin surfaces, outside the audited mobile-app lifetime. No `.channel(...).subscribe()` pattern exists in the app client. Therefore no mobile Supabase socket/subscription accumulation path was found.

## React Render Results

- Home: only `AppScheduleDashboard` owns the one-second `now` state. It re-sorts periods only when `periods` changes and recalculates schedule state once per tick.
- Calendar: `CalendarScheduleClient` owns a one-second clock, so the full client component rerenders while Calendar is active.
- Events and Athletics have no recurring client clock.
- Offline context changes when cache/sync state changes, not once per second.
- `AppRoutePrefetch` runs on every pathname and requests prefetch for the four finite tabs. Next.js deduplication/router caching should make this stabilize, but it does add startup/navigation work and finite route-cache memory.
- Two `ThemeRouteSync` instances run on app routes, so theme resolution and media-query listening are duplicated.

React Profiler commit durations were not captured. The stable DOM does not establish render cost.

## Network Results

Expected recurring traffic from source:

| Request/work | Cadence | Purpose | Duplication control |
|---|---|---|---|
| Offline snapshot GET | Launch, every 5 minutes while visible, foreground/online/midnight/manual | Refresh offline school data | Provider + per-tenant promise deduplication |
| Service-worker `registration.update()` | Launch, every 15 minutes while visible, foreground follow-up | Detect worker updates | One `checkInFlight` promise |
| `/api/pwa-version` | Same PWA update checks | Detect app-only deployment changes | Part of same `checkInFlight` |
| Notification inbox GET | Once after startup when device identity exists; when drawer/page opens | Unread count and inbox | Header request aborts on unmount; drawer request does not |
| Route RSC/prefetch | Initial and pathname changes until finite tab cache is warm | Fast tab navigation | Framework/router cache |

No network polling every second or every few seconds was found. The one-second schedule clocks are local computation only.

The notification drawer fetch is not abortable and is not deduplicated. Rapid open/close can transiently leave multiple requests/promises until the network settles. This is a bounded user-action path in normal use, not a confirmed leak.

## Service Worker and Cache Results

The service worker has no continuous timer, polling loop, or persistent in-memory dataset. Its listeners are installed once per worker lifecycle. Navigation cache writes clone responses and complete under `event.waitUntil` without delaying delivery of the live response.

Persistent Cache Storage is not bounded by entry count:

- hashed `/_next/static/` assets remain in `sundial-assets-v4` until the cache name changes or the browser evicts storage;
- every app/kiosk navigation request URL can be added to `sundial-navigation-v4`, including distinct query URLs;
- school cache purge occurs only for an explicit unavailable-school message.

This is disk/cache growth, not proof of JavaScript heap growth. It should be measured with Safari storage inspection before changing offline behavior.

## Object URL, File, and Image Results

No `URL.createObjectURL`, `FileReader`, `Blob`, canvas, PDF, or ArrayBuffer path is used by the student mobile app. Object URLs found in admin upload/debug surfaces are revoked.

The live school logo is the strongest concrete memory-pressure finding:

- transfer: 101,798 bytes WebP;
- natural dimensions: 3425 x 3425;
- Home display: 36 x 36;
- source uses a plain `<img src>` with no responsive thumbnail URL;
- full 32-bit decoded upper bound: 46,922,500 bytes, approximately 44.75 MiB;
- source pixels exceed displayed pixels by about 9,051x.

The browser may share one decode between header and drawer, downsample, discard, or recreate decoded data. Therefore 44.75 MiB is an upper-bound calculation, not a measured footprint. Safari's Memory timeline should confirm the Images category before implementation. If confirmed, generate/cache tenant-logo derivatives sized for mobile headers and menus while retaining the original for larger surfaces.

## Startup Results

Application-side startup is structured to expose a launch surface early:

- critical launch CSS is inline;
- the compact launch mark is preloaded with high priority;
- the server launch markup does not wait for client hydration;
- the service worker returns a live navigation response before its background cache write finishes;
- local audience state chooses the destination synchronously;
- audience network reconciliation does not gate launch;
- cache/route/paint waits have failure ceilings.

Observable potential contributors:

1. The public tenant layout fetches default appearance and public-school data on school-host app routes even though `SchoolPublicNav` and `PublicFooterRoute` later render `null` for `/app`. This is real server work on a surface that does not display those components.
2. Mobile layout and mobile page both call `requireMobileAppSchool`; school data is cached for five minutes, but feature availability is queried on each call.
3. `AppRoutePrefetch` requests all four tabs on initial mount/path changes.
4. The application loads approximately 269 KiB compressed JavaScript referenced by Home HTML.

These items may affect TTFB, hydration, or early network competition, but this run did not capture a main-thread trace or Server-Timing attribution. They should be instrumented before restructuring.

The roughly two-second black interval cannot be assigned entirely to Sundial. Anything before navigation start/first document availability belongs to iOS/WebKit launch behavior. The exact split requires a screen recording synchronized with Safari Timelines and Sundial's recorded `navigation_start`, `first_root_html_received`, `first_paint`, and `root_shell_first_paint` events.

## iOS / WebKit Test Protocol

Apple's current setup is documented in [Inspecting iOS and iPadOS](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios) and [Enabling features for web developers](https://developer.apple.com/documentation/safari-developer-tools/enabling-developer-features). WebKit documents Memory/Allocation behavior in the [Timelines tab](https://webkit.org/web-inspector/timelines-tab/) and [Memory Debugging with Web Inspector](https://webkit.org/blog/6425/memory-debugging-with-web-inspector/).

### Connect and select the installed PWA

1. On iPhone, open Settings -> Apps -> Safari -> Advanced and enable Web Inspector.
2. Connect the unlocked iPhone to the Mac with a cable and trust the Mac if prompted.
3. On Mac Safari, open Safari -> Settings -> Advanced and enable Show features for web developers.
4. Launch the installed Sundial Home Screen app and keep it in the foreground.
5. In Safari's Develop menu, select the iPhone, then select Sundial's URL under **Home Screen Web Apps**. Do not select the ordinary Safari tab. Apple's inspection window can also list Home Screen apps and separately running service workers.

### Capture the baseline

1. Close unrelated iPhone apps and record device model, iOS version, Sundial deployment, tenant, appearance, and network type.
2. Start an iPhone screen recording before launching Sundial.
3. In Web Inspector Timelines, enable Network Requests, Layout & Rendering, JavaScript & Events, CPU, Memory, and JavaScript Allocations. Memory can perturb results, so also make a second CPU/network-only recording.
4. Force-close Sundial, begin the timeline, launch it, and place marks at launch surface, Home visible, and Home interactive.
5. Record for 60 seconds, then 5 minutes. For a 10-minute run, keep Web Inspector attached and avoid interacting.
6. Export the timeline recording.

Record at each checkpoint:

- Memory timeline totals and JavaScript / Images / Layers / Page categories;
- CPU baseline and wakeups;
- network requests and bytes;
- DOM node and listener/timer statistics shown by the CPU/Events detail views;
- Sundial startup diagnostics from the Console;
- whether the 3425px logo produces a large Images-category step.

### Heap snapshots and detached nodes

1. Reach settled Home and start JavaScript Allocations recording. The start snapshot performs a full garbage collection.
2. Capture/label a Home baseline snapshot using the inspector button or `console.takeHeapSnapshot("home-baseline")` while Web Inspector is open.
3. Run the exact six-route cycle 1, 5, 10, and 20 times; take snapshots after each checkpoint.
4. Compare the later snapshot against the baseline. Filter for DOM nodes, React-related objects, timers, promises, `SchoolOfflineSnapshot`, and route component names.
5. For detached elements, select an instance and inspect the shortest path to a root. Product leaks should have a product-controlled retaining chain such as Window -> listener -> closure -> detached component. Do not classify JavaScriptCore structures or Inspector objects alone as leaks.
6. A healthy pattern may rise on first use, then plateau or fall after snapshot-triggered GC. A leak requires retained instances/bytes increasing with repeated equivalent work.

### Navigation and swipe protocol

1. Take the baseline snapshot.
2. Repeat Home -> Calendar -> Events -> Athletics -> More -> Home 20 times, marking generations/snapshots at 1, 5, 10, and 20.
3. Repeat with real gestures: complete swipes, cancelled partial swipes, rapid swipe then tab tap, repeated current-tab taps, and More open/close followed immediately by Home.
4. Count live `<main>`, route headings, dialogs, and any `AppSwipeNavigation`-related closures in each snapshot.
5. Specifically verify whether the first Home tap is ignored after More closes.

### Background / foreground protocol

1. From settled Home, snapshot and note memory categories.
2. Press Home/lock the phone for 10 seconds, return, and wait for sync/update work to settle.
3. Repeat 20 times. Snapshot at 1, 5, 10, and 20.
4. In Network, confirm each resume produces no more than the expected coalesced snapshot/update activity.
5. Confirm listener/timer counts return to the same steady values and the 5/15-minute intervals do not multiply.
6. Repeat once offline and once reconnecting online.

### CPU and network idle protocol

1. Make a CPU-only 60-second Home recording. Expect a small once-per-second JavaScript event from the schedule dashboard, not large layout/style work.
2. Make a 6-minute network recording. Expect the five-minute snapshot refresh; no repeated few-second traffic should occur.
3. Make a 16-minute recording if practical to observe one PWA update interval.
4. Inspect foreground bursts separately from idle averages.

### Normal cache versus leak

Normal behavior:

- first-visit route/image/framework growth followed by a plateau;
- Images or Page memory that WebKit later purges under pressure;
- heap spikes that return near baseline after snapshot-triggered GC;
- finite router/service-worker caches without growing live route instances.

Leak evidence:

- the same retained class/DOM subtree grows each cycle after GC;
- shortest retaining paths point to Sundial listeners, timers, promises, or global maps;
- listener/timer/subscription counts rise after each resume;
- post-GC baseline rises consistently across 5, 10, and 20 cycles.

### Xcode Instruments

Safari Web Inspector is the primary tool because it can attribute JavaScript, decoded Images, Layers, Page memory, and retaining paths to the PWA. Xcode Instruments is supplementary. Apple's [memory-use guidance](https://developer.apple.com/documentation/Xcode/gathering-information-about-memory-use) explains Allocations generations and process footprint.

If Instruments exposes an attachable WebKit Web Content process for the connected device:

1. Launch Instruments directly and choose Allocations plus VM Tracker (and Time Profiler in a separate run).
2. Select the connected iPhone and the WebKit Web Content process corresponding to the foreground Sundial PWA.
3. Record a baseline and mark generations at the same navigation/resume checkpoints.
4. Correlate footprint changes with Safari's timeline and the iPhone screen recording.

WebKit processes can be shared, short-lived, renamed, relaunched, or unavailable for attachment, so process attribution must be verified by foregrounding/closing Sundial. Do not treat a generic WebContent process total as Sundial-only without that correlation. Jetsam/termination evidence is stronger than a single process number; retain any device analytics report if iOS reloads or kills the PWA.

## Development Performance HUD Evaluation

A development-only HUD would be useful after the first device capture, mainly to correlate owned resources with Safari timelines.

Safe, accurate metrics:

- DOM node count;
- app visibility;
- active sync count owned by Sundial;
- last successful sync;
- current sync state;
- service-worker controller URL/state and bounded diagnostics;
- explicitly instrumented mount/unmount/live-instance counts;
- explicitly registered Sundial timer/listener counts if all audited modules use a development registry.

Do not show as authoritative:

- total iOS process memory;
- JavaScript heap where `performance.memory` is absent;
- detached-node count without a heap snapshot;
- browser/framework listener or timer totals inferred by monkey-patching after startup;
- CPU percentage synthesized from animation timing.

If implemented, compile the registry behind `process.env.NODE_ENV !== "production"`, install it before audited modules create resources, expose only module-owned registrations, and include tests proving the production bundle does not render or initialize it. Prefer explicit registration helpers in Sundial lifecycle modules over globally replacing `addEventListener`, `setTimeout`, or `fetch`.

## Findings by Severity

### CRITICAL

None found.

### HIGH

None confirmed.

### MEDIUM

#### M1. Oversized decoded school logo can create disproportionate image memory

- Files: `src/components/SchoolLogo.tsx`
- Behavior: a 3425 x 3425 source is displayed at 36 x 36 on Home with no mobile derivative.
- Evidence: live natural/client dimensions, 101,798-byte transfer, 44.75-MiB full RGBA upper bound.
- Reproduction: open live Home and inspect the school-logo image dimensions and Memory timeline Images category.
- Probable cause: original uploaded asset is used directly on all logo surfaces.
- Safest fix: after Safari confirmation, generate and reference size-appropriate tenant-logo derivatives while preserving the original.
- Change risk: cache invalidation, transparent artwork quality, tenant branding, and fallback behavior.

#### M2. App routes perform public-site tenant work that renders no app UI

- Files: `src/app/[school]/layout.tsx`, `src/components/SchoolPublicNav.tsx`, `src/components/public-site/PublicFooterRoute.tsx`
- Behavior: school-host app requests fetch default appearance and public-school data; client components later return `null` for `/app`.
- Evidence: direct code path plus Home TTFB of 283-392 ms. The exact query share was not isolated.
- Reproduction: add development/server `Server-Timing` marks around parent-layout lookups and compare an app-route short circuit.
- Probable cause: public and app experiences share a parent layout whose route exclusion occurs inside client children.
- Safest fix: measure first; then avoid public-only data fetches for app/kiosk/admin paths without weakening archived-school or tenant checks.
- Change risk: tenant theming, metadata, public navigation, and canonical routing.

#### M3. Service-worker Cache Storage has no entry/age bound

- File: `public/sw.js`
- Behavior: hashed static assets and distinct navigation URLs accumulate within cache versions until manual cache-version change or browser eviction.
- Evidence: cache-first static assets, network-first navigation writes, no age/count pruning.
- Reproduction: inspect Cache Storage across deployments and many month/query navigations.
- Impact: persistent storage growth, not a proven JavaScript memory leak.
- Safest fix: measure real quota/entry growth, then add conservative versioning/pruning that preserves offline guarantees.
- Change risk: offline launch and route availability.

### LOW

#### L1. Once-per-second route clocks keep Home/Calendar from being fully CPU idle

The timers clean up correctly, but they do not check visibility. Measure CPU/layout cost before changing cadence or visibility behavior.

#### L2. Theme synchronization is duplicated on app routes

Root and app layouts both mount `ThemeRouteSync`, causing two media-query listeners and two theme applications per pathname change. Cleanup is correct; this is work duplication, not a leak.

#### L3. Notification drawer fetches are not cancelled/deduplicated

Rapid open/close can leave multiple inbox fetch promises until they settle. Normal use is bounded, and no retained leak was measured.

#### L4. Production navigation diagnostics keep a server-global tenant map without eviction

`src/lib/navDiagnostics.ts` stores one timestamp per observed school in a global `Map`. This affects a warm server process, not the phone. Growth is bounded by unique tenant count but has no eviction.

#### L5. Rapid More-close stress intermittently required a second Home activation

Six of 20 automated cycles needed one retry. Confirm with real touch input; do not infer a swipe memory leak from this behavior.

### INFORMATIONAL

- No live duplicate route DOM trees were observed through 20 cycles.
- No DOM growth was observed through five minutes idle.
- Snapshot memory is full-dataset by design but small at current/current-cap scale.
- No mobile Supabase subscription/socket exists.
- No mobile object-URL path exists.
- App route prefetch/router caching is finite across four primary tabs.
- Diagnostic arrays are capped at 24/48 events.
- Browser caching and decoded-image caching are not themselves leaks; retained growth after GC/pressure is required.

## Recommended Fix and Verification Order

1. Run the physical-iPhone Safari protocol and capture Home baseline, 20 navigation cycles, and 20 resume cycles. This is the release-gating evidence for the leak question.
2. Confirm the Images-category cost of the 3425px logo. If material, implement only the responsive tenant-logo derivative path and remeasure.
3. Add development/server timing marks around parent tenant layout, mobile layout, page data, first paint, hydration, cache hydration, and launch handoff. Reproduce the black interval with synchronized screen recording.
4. Measure Cache Storage entries/bytes after many deployments/month navigations before defining a pruning policy.
5. Profile the Home and Calendar one-second commits. Change cadence or isolate more rendering only if the CPU/layout trace is material.
6. Reproduce the More-close/Home activation issue on iPhone and fix it separately if real.
7. Consider a small development-only owned-resource HUD after the first Safari capture establishes which counters are useful.

Do not refactor the startup architecture, remove offline caching, alter service-worker strategy, add blanket memoization, or change navigation behavior before these measurements are reviewed.
