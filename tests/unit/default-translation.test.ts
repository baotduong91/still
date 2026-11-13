import { afterEach, beforeEach, expect, it } from "vitest";
import { defaultTranslationFromAvailable } from "@/lib/bible/default-translation";
import { serverDefaultTranslation } from "@/lib/bible/default-translation-server";

beforeEach(() => {
  delete process.env.DEFAULT_TRANSLATION;
  delete process.env.API_BIBLE_KEY;
  delete process.env.API_BIBLE_CSB_ID;
  delete process.env.API_BIBLE_NLT_ID;
  delete process.env.API_BIBLE_MSG_ID;
  delete process.env.API_BIBLE_NONCOMMERCIAL;
});

afterEach(() => {
  delete process.env.DEFAULT_TRANSLATION;
  delete process.env.API_BIBLE_KEY;
  delete process.env.API_BIBLE_CSB_ID;
  delete process.env.API_BIBLE_NLT_ID;
  delete process.env.API_BIBLE_MSG_ID;
  delete process.env.API_BIBLE_NONCOMMERCIAL;
});

it("falls back to WEB when no API.Bible editions are configured", () => {
  expect(serverDefaultTranslation()).toBe("WEB");
  expect(defaultTranslationFromAvailable(["WEB"])).toBe("WEB");
});

it("prefers DEFAULT_TRANSLATION when that edition is enabled", () => {
  process.env.API_BIBLE_KEY = "fixture";
  process.env.API_BIBLE_NONCOMMERCIAL = "true";
  process.env.API_BIBLE_CSB_ID = "csb";
  process.env.API_BIBLE_MSG_ID = "msg";
  process.env.DEFAULT_TRANSLATION = "MSG";
  expect(serverDefaultTranslation()).toBe("MSG");
});

it("walks CSB then NLT then MSG when DEFAULT_TRANSLATION is unset", () => {
  process.env.API_BIBLE_KEY = "fixture";
  process.env.API_BIBLE_NONCOMMERCIAL = "true";
  process.env.API_BIBLE_NLT_ID = "nlt";
  expect(serverDefaultTranslation()).toBe("NLT");
});
