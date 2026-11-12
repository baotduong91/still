import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { SavedState } from "../../lib/client/store";
async function savedState(page: Page): Promise<SavedState> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("still-private", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("state")
            .objectStore("state")
            .get("current");
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
  );
}
test("a clean desktop chooses a private starter, opens Day 1, and keeps its identity on reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const api: string[] = [],
    requests: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    requests.push(request.url() + (request.postData() ?? ""));
    if (
      new URL(request.url()).pathname.startsWith("/api/") &&
      request.method() !== "HEAD"
    )
      api.push(request.url());
  });
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Your Still on this device." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Begin my journey", exact: true }),
  ).toBeEnabled();
  await page.getByText("Grief", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Grief", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".welcome-preview")).toContainText(
    "Held in the sorrow",
  );
  await expect(page.locator(".welcome-preview")).toContainText(
    "7 days · Guided study · WEB",
  );
  const before = await savedState(page);
  expect(before.plans).toHaveLength(0);
  expect(before.deviceProfile?.formFactor).toBe("desktop");
  expect(api).toEqual([]);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("welcome-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Permission to lament" }),
  ).toBeVisible();
  await expect(page.getByText("Day 1 of 7", { exact: true })).toBeVisible();
  const started = await savedState(page);
  expect(started.activeId).toBe(started.plans[0].id);
  expect(started.deviceProfile?.starterIntent).toBe("grief");
  expect(started.deviceProfile?.id).toBe(before.deviceProfile?.id);
  expect(started.journeyOnboarding?.completedAt).toBeTruthy();
  expect(started.setupSeen).toBe(true);
  expect(started.remoteIds).toEqual([]);
  expect(started.plans[0].provider).toBe("curated");
  expect(api).toEqual([]);
  expect(
    requests.some((request) => request.includes(started.deviceProfile!.id)),
  ).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Permission to lament" }),
  ).toBeVisible();
  const returned = await savedState(page);
  expect(returned.activeId).toBe(started.activeId);
  expect(returned.deviceProfile).toEqual(started.deviceProfile);
  await expect(page.locator(".device-welcome")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mobile welcome fits both themes and begins a five-day prayer journey", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["dark", "light"]) {
    await page.goto("/settings");
    await page.getByLabel("Appearance").selectOption(theme);
    await page.getByRole("link", { name: "Today", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Begin my journey", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".welcome-preview")).toContainText(
      "5 days · Guided study · WEB",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`welcome-mobile-${theme}.png`),
      fullPage: true,
    });
  }
  await page.getByText("Prayer", { exact: true }).click();
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(page.getByText("Day 1 of 5", { exact: true })).toBeVisible();
  const state = await savedState(page);
  expect(state.deviceProfile?.formFactor).toBe("mobile");
  expect(state.plans[0].profile.themes).toEqual(["prayer"]);
  expect(state.plans[0].profile.pace).toBe("gentle");
});

test("Customize opens an empty Create form without creating a starter", async ({
  page,
}) => {
  await page.goto("/journey");
  await page
    .getByRole("button", { name: "Customize in Create", exact: true })
    .click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel("I’d like to explore…")).toHaveValue("");
  const state = await savedState(page);
  expect(state.plans).toHaveLength(0);
  expect(state.activeId).toBeNull();
  expect(state.journeyOnboarding?.completedAt).toBeUndefined();
  expect(state.journeyOnboarding?.dismissedWelcome).toBe(true);
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Your Still on this device." }),
  ).toBeVisible();
});

test("confirmed start fresh rotates identity and clears journeys while retaining journal, preferences and PIN", async ({
  page,
}) => {
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(page.locator(".today-player")).toBeVisible();
  const before = await savedState(page);
  await page.goto("/journal");
  await page
    .getByLabel("Today, I’m noticing…")
    .fill("A journal moment to keep through a fresh start.");
  await page
    .getByRole("button", { name: "Save this moment", exact: true })
    .click();
  await expect(
    page.getByText("A journal moment to keep through a fresh start.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Appearance").selectOption("dark");
  await page.locator("#new-pin").fill("284691");
  await page.locator("#confirm-pin").fill("284691");
  await page.getByRole("button", { name: "Enable PIN screen lock" }).click();
  await expect(page.getByRole("status")).toContainText("ready on this device");
  await page
    .getByRole("button", { name: "Start fresh on this device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep my journeys", exact: true })
    .click();
  expect((await savedState(page)).activeId).toBe(before.activeId);
  await page
    .getByRole("button", { name: "Start fresh on this device", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Remove journeys and start fresh",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your Still on this device." }),
  ).toBeVisible();
  const reset = await savedState(page);
  expect(reset.deviceProfile?.id).not.toBe(before.deviceProfile?.id);
  expect(reset.plans).toHaveLength(0);
  expect(reset.activeId).toBeNull();
  expect(reset.journeyOnboarding).toEqual({});
  expect(reset.journals[0].text).toBe(
    "A journal moment to keep through a fresh start.",
  );
  expect(reset.theme).toBe("dark");
  expect(reset.pinLock).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A little privacy." }),
  ).toBeVisible();
  await page.getByLabel("Your PIN", { exact: true }).fill("284691");
  await page.getByRole("button", { name: "Open my space" }).click();
  await expect(
    page.getByRole("heading", { name: "Your Still on this device." }),
  ).toBeVisible();
  expect((await savedState(page)).deviceProfile?.id).toBe(
    reset.deviceProfile?.id,
  );
});

test("downloaded WEB supports a new reference starter entirely offline", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Download for offline", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Ready offline", {
    timeout: 60000,
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto("/today");
  await page.getByText("John 3:16", { exact: true }).click();
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1. Read slowly" }),
  ).toBeVisible();
  await expect(page.locator("blockquote")).toContainText(
    "For God so loved the world",
  );
  await page.reload();
  await expect(page.getByText("Day 1 of 7", { exact: true })).toBeVisible();
  expect((await savedState(page)).remoteIds).toEqual([]);
});
