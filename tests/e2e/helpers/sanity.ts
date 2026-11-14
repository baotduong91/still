import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Corpus } from "../../../lib/bible";
export const webCorpus = JSON.parse(
  readFileSync(
    new URL("../../../public/bibles/WEB.json", import.meta.url),
    "utf8",
  ),
) as Corpus;

// Assertions use raw corpus records rather than the rendering/retrieval helper.
export const webVerse = (book: string, chapter: number, verse: number) => {
  const record = webCorpus.verses.find(
    (v) => v.book === book && v.chapter === chapter && v.verse === verse,
  );
  if (!record) throw new Error("Missing canonical test verse");
  return record.text;
};
export const todayText = webVerse("Matthew", 6, 34);
export const todayReference = "Matthew 6:34";

export async function quoteText(verse: Locator) {
  return verse.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("sup").forEach((node) => node.remove());
    return copy.textContent!.trim();
  });
}
export async function assertExactToday(page: Page, translation = "WEB") {
  const verse = page.locator("#today-scripture blockquote");
  await expect(verse).toBeVisible();
  expect(await quoteText(verse)).toBe(todayText);
  await expect(page.locator(".flow-verse .eyebrow")).toHaveText(
    `${todayReference} · ${translation}`,
  );
}

export async function assertTouchTarget(target: Locator) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

export async function assertReachable(target: Locator) {
  await target.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect(target).toBeInViewport();
  expect(
    await target.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
}

// Deterministic media adapters: real app routing/cancellation runs, external TTS
// and multi-minute model compilation don't. Real-engine tests remain opt-in.
export async function installVoiceHarness(page: Page) {
  await page.addInitScript(() => {
    const state = {
      localText: [] as string[],
      deviceText: [] as string[],
      plays: 0,
      active: 0,
    };
    Object.assign(window, { sanityVoice: state });
    class AudioStub {
      active = false;
      playbackRate = 1;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      async play() {
        state.plays++;
        if (!this.active) {
          state.active++;
          this.active = true;
        }
      }
      pause() {
        if (this.active) {
          state.active--;
          this.active = false;
        }
      }
      load() {}
      removeAttribute() {}
    }
    Object.defineProperty(window, "Audio", { value: AudioStub });
    class WorkerStub extends EventTarget {
      timers = new Map<number, ReturnType<typeof setTimeout>>();
      postMessage(input: { id: number; text?: string; mode?: string }) {
        if (input.mode === "cancel") {
          clearTimeout(this.timers.get(input.id));
          this.timers.delete(input.id);
          return;
        }
        if (input.mode === "clear") return;
        if (input.text && (!input.mode || input.mode === "prime")) state.localText.push(input.text);
        const timer = setTimeout(() => {
          this.timers.delete(input.id);
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                id: input.id,
                backend: "WASM",
                modelWarmed: true,
                type:
                  input.mode === "warm" || !input.text
                    ? "ready"
                    : input.mode === "prime"
                      ? "primed"
                      : "audio",
                ...(input.text ? { wav: new ArrayBuffer(100) } : {}),
              },
            }),
          );
        }, 20);
        this.timers.set(input.id, timer);
      }
      terminate() {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
      }
    }
    Object.defineProperty(window, "Worker", { value: WorkerStub });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(public text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          { name: "Fixture local voice", lang: "en-US", localService: true },
        ],
        speak: (utterance: { text: string }) =>
          state.deviceText.push(utterance.text),
        cancel() {},
        pause() {},
        resume() {},
      },
    });
  });
}

export async function voiceState(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          sanityVoice: {
            localText: string[];
            deviceText: string[];
            plays: number;
            active: number;
          };
        }
      ).sanityVoice,
  );
}
