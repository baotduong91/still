import { devotionReflectionText } from "../../lib/tts/reading";
import { seedOfflineKokoroAssets } from "./helpers/bella-cache";
import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { Bible } from "../../lib/bible";
import {
  assertExactToday,
  assertReachable,
  assertTouchTarget,
  installVoiceHarness,
  quoteText,
  todayReference,
  todayText,
  voiceState,
  webVerse,
  webCorpus,
} from "./helpers/sanity";

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: "en-US",
  timezoneId: "UTC",
  stateOverrides: {
    theme: "dark",
    setupSeen: true,
    deviceProfile: {
      id: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-11-11T12:00:00.000Z",
      formFactor: "mobile",
      starterVariant: 0,
    },
    journeyOnboarding: { completedAt: "2026-11-11T12:00:00.000Z" },
  },
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-11T12:00:00.000Z"));
  await installVoiceHarness(page);
  await page.route("**/api/tts", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          contentType: "audio/mpeg",
          body: Buffer.from([0xff, 0xfb, 0x90, 0]),
        }),
  );
});

test("one continuous offline journey saves Practice and participation, then creates a no-key reference study", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Download for offline", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Ready offline");
  await page.reload();
  await context.setOffline(true);
  await page.goto("/today");
  await assertExactToday(page);
  await expect(page.getByLabel("Your participation")).toContainText(
    "0 days you made space.",
  );
  expect(
    await page
      .locator(".flow-section")
      .evaluateAll((nodes) => nodes.map((node) => node.id)),
  ).toEqual([
    "today-scripture",
    "today-reflection",
    "today-prayer",
    "today-practice",
  ]);
  await expect(page.getByRole("tab")).toHaveCount(0);
  const documentToken = await page.evaluate(() => {
    const token = crypto.randomUUID();
    Object.assign(window, { documentToken: token });
    return token;
  });
  for (const next of ["reflection", "prayer", "practice"]) {
    await page
      .getByRole("button", { name: `Continue to ${next}`, exact: true })
      .click();
    await expect(page.locator(`#today-${next}`)).toBeInViewport();
    expect(new URL(page.url()).pathname).toBe("/today");
    expect(
      await page.evaluate(
        () => (window as unknown as { documentToken: string }).documentToken,
      ),
    ).toBe(documentToken);
  }
  const response = "One responsibility today; leave tomorrow's worry here.";
  await page.getByLabel("My response for today").fill(response);
  await page
    .getByRole("button", { name: "Save my response", exact: true })
    .click();
  await expect(page.locator(".practice-form [role=status]")).toContainText(
    "saved with Day 1",
  );
  await page.reload();
  await page.getByRole("link", { name: "04 Practice" }).click();
  await expect(page.getByLabel("My response for today")).toHaveValue(response);
  await page
    .getByRole("button", { name: "Complete today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Day complete", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Your participation")).toContainText(
    "1 days you made space.",
  );
  await expect(
    page.getByLabel("2026-11-11: participated", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Day 2 of 7", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open day 1", exact: true }).click();
  await expect(page.getByLabel("My response for today")).toHaveValue(response);
  await expect(page.getByLabel("Your participation")).toContainText(
    "1 days you made space.",
  );
  const planCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/awp/plans/generate"))
      planCalls.push(request.url());
  });
  await page.goto("/create");
  await page.getByLabel("I’d like to explore…").fill("Study John 3:16");
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1. Read slowly", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator("blockquote").evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("sup").forEach((n) => n.remove());
      return copy.textContent!.trim();
    }),
  ).toBe(webVerse("John", 3, 16));
  expect(planCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile Today animates within one document, avoids player collisions, and matches the dark visual baseline", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const theme of ["dark", "light"]) {
    if (theme === "light") {
      await page.goto("/settings");
      await page.getByLabel("Appearance").selectOption("light");
    }
    await page.goto("/today");
    await assertExactToday(page);
    await page.evaluate(() => document.fonts.ready);
    if (theme === "dark")
      await expect(page).toHaveScreenshot("today-dark-mobile.png", {
        animations: "disabled",
        fullPage: false,
      });
    const marker = await page.evaluate(() => {
      const data = {
        marker: crypto.randomUUID(),
        shifts: 0,
        scrolls: [] as number[],
      };
      Object.assign(window, { sanityLayout: data });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (
            !(entry as PerformanceEntry & { hadRecentInput: boolean })
              .hadRecentInput
          )
            data.shifts += (
              entry as PerformanceEntry & { value: number }
            ).value;
      }).observe({ type: "layout-shift", buffered: false });
      addEventListener("scroll", () => data.scrolls.push(scrollY), {
        passive: true,
      });
      return data.marker;
    });
    for (const section of ["scripture", "reflection", "prayer", "practice"]) {
      const heading = page.locator(`#today-${section} h2`);
      await expect(heading).toBeInViewport();
      const player = await page.locator(".today-player").boundingBox();
      const nav = await page.locator(".sidebar").boundingBox();
      expect(player!.y + player!.height).toBeLessThanOrEqual(nav!.y);
      expect(
        (await heading.boundingBox())!.y +
          (await heading.boundingBox())!.height,
      ).toBeLessThan(player!.y);
      for (const control of await page
        .locator(".today-player button, .today-player select")
        .all())
        await assertTouchTarget(control);
      const next =
        section === "practice"
          ? null
          : ["reflection", "prayer", "practice"][
              ["scripture", "reflection", "prayer"].indexOf(section)
            ];
      if (next) {
        const control = page.getByRole("button", {
          name: `Continue to ${next}`,
          exact: true,
        });
        await assertTouchTarget(control);
        await assertReachable(control);
        await page.evaluate(() => {
          (
            window as unknown as { sanityLayout: { scrolls: number[] } }
          ).sanityLayout.scrolls = [];
        });
        await control.click();
        await expect
          .poll(() =>
            page
              .locator(`#today-${next}`)
              .evaluate((el) => Math.abs(el.getBoundingClientRect().top - 14)),
          )
          .toBeLessThan(2);
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { sanityLayout: { scrolls: number[] } })
                .sanityLayout.scrolls.length,
          ),
        ).toBeGreaterThan(2);
      }
    }
    await assertReachable(page.getByLabel("My response for today"));
    await assertReachable(
      page.getByRole("button", { name: "Complete today", exact: true }),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const layout = await page.evaluate(
      () =>
        (
          window as unknown as {
            sanityLayout: { marker: string; shifts: number };
          }
        ).sanityLayout,
    );
    expect(layout.marker).toBe(marker);
    expect(layout.shifts).toBeLessThan(0.05);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.goto("/create-image?ref=Matthew%206%3A34&translation=WEB");
  await expect(
    page.getByRole("button", { name: "Save to device", exact: true }),
  ).toBeEnabled();
  for (const group of ["Image format", "Image style"])
    for (const control of await page
      .getByRole("group", { name: group })
      .getByRole("button")
      .all())
      await assertTouchTarget(control);
  await page
    .getByRole("group", { name: "Image format" })
    .getByRole("button", { name: /Square/ })
    .click();
  await page
    .getByRole("group", { name: "Image style" })
    .getByRole("button", { name: "Dawn" })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    `${todayText} — ${todayReference} · WEB`,
  );
  await assertReachable(
    page.getByRole("button", { name: "Share", exact: true }),
  );
});

test("translation changes and missing online editions preserve exact WEB wording, citations, and TTS bytes", async ({
  page,
}) => {
  const sent: { text: string; reference: string }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/tts") && request.method() === "POST")
      sent.push(request.postDataJSON());
  });
  const bible = new Bible(webCorpus);
  await page.route("**/api/awp/scripture?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        passage: bible.lookup(
          params.get("reference")!,
          params.get("translation") as "CSB" | "NLT",
        ),
      },
    });
  });
  for (const translation of ["WEB", "CSB", "NLT"]) {
    await page.goto("/settings");
    await page.getByLabel("Preferred translation").selectOption(translation);
    await expect(page.getByLabel("Preferred translation")).toHaveValue(
      translation,
    );
    if (translation !== "WEB") {
      const onlineScripture = page.getByRole("checkbox", {
        name: /Enable API.Bible/,
      });
      if (!(await onlineScripture.isChecked())) await onlineScripture.click();
      await expect(onlineScripture).toBeChecked();
    }
    await page.goto("/today");
    await assertExactToday(page);
    if (translation !== "WEB")
      await expect(page.locator(".flow-translation-notice")).toContainText(
        "WEB",
      );
    await page
      .getByRole("button", { name: "Play Scripture", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause Scripture", exact: true }),
    ).toBeVisible({ timeout: 1500 });
    expect(sent.at(-1)!.text).toBe(todayText);
    expect(sent.at(-1)!.reference).toBe(todayReference);
    await page
      .getByRole("button", { name: "Stop Scripture", exact: true })
      .click();
  }
  expect(sent).toHaveLength(3);
});

test("voice routing stays private and responsive across delayed Edge, Bella, offline, and explicit device preference", async ({
  page,
  context,
  savedPlan,
}) => {
  await page.goto("/settings");
  await seedOfflineKokoroAssets(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let edgeCalls = 0;
  await page.route("**/api/tts", async (route) => {
    if (route.request().method() === "HEAD")
      return route.fulfill({ status: 204 });
    edgeCalls++;
    await held;
    await route
      .fulfill({ contentType: "audio/mpeg", body: Buffer.from([1, 2]) })
      .catch(() => {});
  });
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect.poll(() => edgeCalls).toBe(1);
  await expect(page.locator(".audio-engine")).toContainText("Edge");
  // Keep Edge unresolved while the actual Continue control and viewport still work.
  await page
    .getByRole("button", { name: "Continue to reflection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Read reflection aloud", exact: true }),
  ).toBeEnabled();
  release();
  const before = Date.now();
  await page
    .getByRole("button", { name: "Read reflection aloud", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause reflection", exact: true }),
  ).toBeVisible({ timeout: 1500 });
  expect(Date.now() - before).toBeLessThan(1500);
  expect((await voiceState(page)).localText).toContain(
    devotionReflectionText(savedPlan.days[0]),
  );
  await page.getByRole("link", { name: "03 Prayer" }).click();
  await page
    .getByRole("button", { name: "Read prayer aloud", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause prayer", exact: true }),
  ).toBeVisible();
  expect((await voiceState(page)).localText.at(-1)).toBe(
    `A prayer inspired by today’s reading. This is not Scripture.\n\n${savedPlan.days[0].prayer}`,
  );
  expect((await voiceState(page)).active).toBe(1);
  await context.setOffline(true);
  await page.getByRole("link", { name: "01 Scripture" }).click();
  await expect(page.locator(".audio-engine")).toContainText("Kokoro");
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
  expect((await voiceState(page)).localText.at(-1)).toBe(
    `${todayText}\n\n${todayReference}`,
  );
  expect(edgeCalls).toBe(1);
  await context.setOffline(false);
  for (const preference of ["kokoro", "device"]) {
    await page.goto("/settings");
    await page.getByLabel("Reading voice engine").selectOption(preference);
    await page.goto("/today");
    await page
      .getByRole("button", { name: "Play Scripture", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause Scripture", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".audio-engine")).toContainText(
      preference === "device" ? "Device voice" : "Kokoro",
    );
    expect(edgeCalls).toBe(1);
  }
  expect((await voiceState(page)).deviceText).toEqual([
    `${todayText}\n\n${todayReference}`,
  ]);
});

test("configured Ollama and cloud use only the chosen mode for plans/chat and surface failure without fallback", async ({
  page,
  savedPlan,
}) => {
  await page.route("**/api/modes", (route) =>
    route.fulfill({
      json: {
        modes: {
          guided: { configured: true },
          ollama: { configured: true, hostedLoopback: false },
          cloud: { configured: true },
        },
        ollamaReachable: null,
      },
    }),
  );
  const calls: { endpoint: string; provider: string }[] = [];
  const bible = new Bible(webCorpus);
  for (const endpoint of ["plans/generate", "chat"])
    await page.route(`**/api/awp/${endpoint}`, (route) => {
      const input = route.request().postDataJSON();
      calls.push({ endpoint, provider: input.provider });
      if ((input.prompt ?? input.question).includes("fixture failure"))
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "Fixture model unavailable",
              recovery: "Choose another mode explicitly.",
            },
          },
        });
      return route.fulfill({
        json:
          endpoint === "chat"
            ? {
                provider: input.provider,
                answer:
                  "A deterministic interpretation of the retrieved passage.",
                interpretation: "Interpretation, not a Scripture quotation.",
                context: "A cited fixture response.",
                limited: false,
                citations: [bible.lookup(todayReference)],
              }
            : {
                plan: {
                  ...savedPlan,
                  id: crypto.randomUUID(),
                  provider: input.provider,
                  profile: { ...savedPlan.profile, prompt: input.prompt },
                },
              },
      });
    });
  await page.goto("/settings");
  await page.getByLabel("Guide", { exact: true }).selectOption("cloud");
  await page.goto("/chat");
  await page.getByLabel("Your Bible question").fill("Why is there suffering?");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".error-banner")).toContainText(
    "Enable cloud sharing",
  );
  expect(calls).toEqual([]);
  for (const provider of ["cloud", "ollama"]) {
    await page.goto("/settings");
    await page.getByLabel("Guide", { exact: true }).selectOption(provider);
    if (provider === "cloud") {
      const consent = page.getByRole("checkbox", { name: /I choose to send/ });
      await consent.click();
      await expect(consent).toBeChecked();
    }
    await page.goto("/create");
    await page
      .getByLabel("I’d like to explore…")
      .fill("A gentle prayer journey");
    await page
      .getByRole("button", { name: "Begin my journey", exact: true })
      .click();
    await expect(page.locator(".today-player")).toBeVisible();
    expect(calls.at(-1)).toEqual({ endpoint: "plans/generate", provider });
    await assertExactToday(page);
    await page.goto("/chat");
    await page
      .getByLabel("Your Bible question")
      .fill("What can this passage teach us?");
    await page
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await page.locator(".answer summary").click();
    await expect(page.locator(".answer blockquote")).toBeVisible();
    expect(await quoteText(page.locator(".answer blockquote"))).toBe(todayText);
    await expect(page.locator(".answer summary")).toContainText(
      `${todayReference} · WEB`,
    );
    expect(calls.at(-1)).toEqual({ endpoint: "chat", provider });
    const count = calls.length;
    await page.getByLabel("Your Bible question").fill("fixture failure");
    await page
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await expect(page.locator(".error-banner")).toContainText(
      "Fixture model unavailable",
    );
    expect(calls.slice(count)).toEqual([{ endpoint: "chat", provider }]);
    await page.goto("/create");
    await page.getByLabel("I’d like to explore…").fill("fixture failure");
    const beforePlanFailure = calls.length;
    await page
      .getByRole("button", { name: "Begin my journey", exact: true })
      .click();
    await expect(page.locator(".error-banner")).toContainText(
      "Fixture model unavailable",
    );
    expect(calls.slice(beforePlanFailure)).toEqual([
      { endpoint: "plans/generate", provider },
    ]);
    expect(new URL(page.url()).pathname).toBe("/create");
  }
});

test("PIN gates Today, journal and chat while public WEB reading and exact citations remain usable", async ({
  page,
}) => {
  await page.goto("/today");
  await page.getByRole("link", { name: "04 Practice" }).click();
  await page
    .getByLabel("My response for today")
    .fill("A private practice behind the PIN.");
  await page
    .getByRole("button", { name: "Save my response", exact: true })
    .click();
  await expect(page.locator(".practice-form [role=status]")).toContainText(
    "saved",
  );
  await page.goto("/settings");
  await page.locator("#new-pin").fill("284691");
  await page.locator("#confirm-pin").fill("284691");
  await page
    .getByRole("button", { name: "Enable PIN screen lock", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("ready on this device");
  await page.reload();
  for (const route of ["today", "journal", "chat"]) {
    await page.goto(`/${route}`);
    await expect(
      page.getByRole("heading", { name: "A little privacy.", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(
        ".today-player, .chat-messages, .journal-entries, #practice-response-form",
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText("A private practice behind the PIN.", { exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("link", {
      name: "Read the public WEB Bible while locked",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Room for the Word.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Public Bible reference").fill("John 3:16");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".public-verse")).toContainText(
    webVerse("John", 3, 16),
  );
  await page.goto("/today");
  await page.getByLabel("Your PIN", { exact: true }).fill("111111");
  await page
    .getByRole("button", { name: "Open my space", exact: true })
    .click();
  await expect(page.locator(".lock-screen")).toContainText("didn’t match");
  await page.getByLabel("Your PIN", { exact: true }).fill("284691");
  await page
    .getByRole("button", { name: "Open my space", exact: true })
    .click();
  await page.getByRole("link", { name: "04 Practice" }).click();
  await expect(page.getByLabel("My response for today")).toHaveValue(
    "A private practice behind the PIN.",
  );
});
