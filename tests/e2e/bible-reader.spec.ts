import { test, expect } from "./fixtures";
import {
  installVoiceHarness,
  assertTouchTarget,
  webCorpus,
} from "./helpers/sanity";
import { Bible } from "../../lib/bible";
const bible = new Bible(webCorpus);
test.use({
  serviceWorkers: "block",
  viewport: { width: 402, height: 874 },
  isMobile: true,
  hasTouch: true,
  stateOverrides: {
    setupSeen: true,
    speechEngine: "edge",
    translation: "WEB",
    translationPreferenceSet: true,
  },
});
test.beforeEach(async ({ page }) => {
  await installVoiceHarness(page);
});

test("player stays compact and centered on desktop and small phones in both themes", async ({
  page,
}, testInfo) => {
  for (const theme of ["light", "dark"]) {
    await page.goto("/settings");
    await page.getByLabel("Appearance").selectOption(theme);
    await page.goto("/scripture");
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 402, height: 874 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const rect = (await page.locator(".bible-player").boundingBox())!;
      const paper = (await page.locator(".reader-paper").boundingBox())!;
      expect(rect.height).toBeLessThanOrEqual(76);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(
        Math.abs(rect.x + rect.width / 2 - paper.x - paper.width / 2),
      ).toBeLessThan(2);
      for (const control of await page
        .locator(".bible-player button:visible, .bible-player summary")
        .all())
        await assertTouchTarget(control);
      if (viewport.width === 402)
        await page.screenshot({
          path: testInfo.outputPath(`bible-player-${theme}-mobile.png`),
        });
    }
  }
});

test.describe("licensed position", () => {
  test.use({
    stateOverrides: {
      setupSeen: true,
      speechEngine: "edge",
      translation: "CSB",
      translationPreferenceSet: true,
      onlineScripture: true,
      biblePosition: { reference: "John 1", verse: 35, verseView: true },
    },
  });
  test("restores the correct CSB page and keeps the location when offline", async ({
    page,
    context,
  }) => {
    const refs: string[] = [];
    await page.route("**/api/awp/scripture?*", async (route) => {
      const ref = new URL(route.request().url()).searchParams.get("reference")!;
      refs.push(ref);
      const source = bible.lookup(ref, "CSB");
      const verses = source.verses.map((v) => ({
        ...v,
        text: `Exact licensed fixture ${v.verse}`,
      }));
      await route.fulfill({
        json: {
          passage: {
            ...source,
            source: "api.bible",
            citationScheme: "edition",
            requestedReference: ref,
            translation: "CSB",
            fallback: false,
            attribution: "Provider fixture",
            verses,
            text: verses.map((v) => v.text).join(" "),
          },
        },
      });
    });
    await page.goto("/scripture");
    await expect(page.locator(".translation-badge")).toHaveText("CSB");
    await expect(page.locator(".bible-player-meta strong")).toContainText(
      "John 1:35",
    );
    expect(refs[0]).toBe("John 1:21-40");
    await context.setOffline(true);
    await expect(page.locator(".translation-badge")).toHaveText("WEB");
    await expect(page.getByLabel("Reading translation")).toHaveValue("CSB");
    await expect(page.locator(".bible-player-meta strong")).toContainText(
      "John 1:35",
    );
  });
});

test("Bible restores the last visible verse after navigation/reload and honors explicit links", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/tts"))
      posts.push(r.url());
  });
  await page.goto("/scripture");
  await page.getByLabel("Search Scripture").fill("John 3");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const verse = page.locator('[data-bible-verse="25"]');
  await verse.evaluate((el) =>
    el.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await expect(page.locator(".bible-player-meta strong")).toContainText(
    "John 3:25",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Journal", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Scripture", exact: true })
    .click();
  await expect(page.getByLabel("Chapter", { exact: true })).toHaveValue("3");
  await expect
    .poll(async () =>
      Math.round(
        (await page.locator('[data-bible-verse="25"]').boundingBox())!.y,
      ),
    )
    .toBeLessThan(60);
  await expect(page.locator(".bible-player-meta strong")).toContainText(
    "John 3:25",
  );
  await page.reload();
  await expect(page.locator(".bible-player-meta strong")).toContainText(
    "John 3:25",
  );
  expect(posts).toEqual([]);
  await page.goto("/scripture?ref=Psalms%2023%3A1");
  await expect(page.getByLabel("Book", { exact: true })).toHaveValue("Psalms");
  await page.getByLabel("Book", { exact: true }).selectOption("Mark");
  await page.reload();
  await expect(page.getByLabel("Book", { exact: true })).toHaveValue("Mark");
});

test("compact Bible player reads exact passages, pauses, advances and stops on navigation", async ({
  page,
}) => {
  const sent: { text: string; reference: string }[] = [];
  await page.addInitScript(() => {
    const players: HTMLAudioElement[] = [];
    Object.assign(window, { bibleAudioPlayers: players });
    window.Audio = new Proxy(window.Audio, {
      construct(target, args) {
        const player = Reflect.construct(target, args) as HTMLAudioElement;
        players.push(player);
        return player;
      },
    });
  });
  await page.route("**/api/tts", async (route) => {
    if (route.request().method() === "HEAD")
      return route.fulfill({ status: 204 });
    sent.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from([0xff, 0xfb, 0x90, 0]),
    });
  });
  await page.goto("/scripture?ref=John%203");
  const player = page.getByRole("region", { name: "Bible reading player" });
  const box = (await player.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(76);
  const nav = (await page.locator(".sidebar").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
  for (const control of await player.locator("button:visible, summary").all())
    await assertTouchTarget(control);
  expect(sent).toHaveLength(0);
  await page
    .getByRole("button", { name: "Play Bible reading", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause Bible reading", exact: true }),
  ).toBeVisible();
  expect(sent[0]).toMatchObject({
    reference: "John 3:1-8",
    text: bible.lookup("John 3:1-8").text,
  });
  await page
    .getByRole("button", { name: "Next reading passage", exact: true })
    .click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({
    reference: "John 3:9-16",
    text: bible.lookup("John 3:9-16").text,
  });
  await expect(
    page.getByRole("button", { name: "Pause Bible reading", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const players = (
      window as unknown as {
        bibleAudioPlayers: (HTMLAudioElement & { active: boolean })[];
      }
    ).bibleAudioPlayers;
    const current = players.findLast((player) => player.active);
    if (!current?.onended) throw new Error("No active Bible audio");
    current.pause();
    current.onended(new Event("ended"));
  });
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toMatchObject({
    reference: "John 3:17-24",
    text: bible.lookup("John 3:17-24").text,
  });
  await page
    .getByRole("button", { name: "Pause Bible reading", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play Bible reading", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Bible audio settings").click();
  await page.getByLabel("Bible reading speed").selectOption("1.2");
  await page
    .getByRole("button", { name: "Stop Bible reading", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Journal", exact: true })
    .click();
  await expect(player).toHaveCount(0);
});
