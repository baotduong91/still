import { it, expect, afterEach, vi } from "vitest";
import { validateBrowserOrigin } from "@/lib/awp/auth";
afterEach(() => vi.unstubAllEnvs());
function request(
  origin: string,
  host = "localhost:3000",
  site = "same-origin",
) {
  return new Request(`http://${host}/api/awp/chat`, {
    headers: { host, origin, "sec-fetch-site": site },
  });
}
it("accepts localhost for a local server configured as 127.0.0.1", () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
  expect(validateBrowserOrigin(request("http://localhost:3000"))).toBe(
    "http://localhost:3000",
  );
});
it("accepts the actual local port when Next chooses another port", () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
  expect(
    validateBrowserOrigin(request("http://127.0.0.1:3001", "127.0.0.1:3001")),
  ).toBe("http://127.0.0.1:3001");
});
it("normalizes a configured trailing slash", () => {
  vi.stubEnv("SITE_URL", "https://still.example/");
  expect(
    validateBrowserOrigin(
      new Request("https://still.example/api/awp/chat", {
        headers: { origin: "https://still.example" },
      }),
    ),
  ).toBe("https://still.example");
});
it.each([
  "https://evil.example",
  "http://localhost.evil.example:3000",
  "http://localhost:9999",
  "null",
])("rejects untrusted origin %s", (origin) => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
  expect(() => validateBrowserOrigin(request(origin))).toThrow();
});
it("retains strict hosted origin checking", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SITE_URL", "https://still.example");
  expect(() =>
    validateBrowserOrigin(request("http://localhost:3000")),
  ).toThrow();
});
it("does not relax cross-site protection for localhost", () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  expect(() =>
    validateBrowserOrigin(
      request("http://localhost:3000", "localhost:3000", "cross-site"),
    ),
  ).toThrow();
});
