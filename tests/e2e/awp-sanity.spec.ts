import { test, expect, type APIResponse } from "@playwright/test";
import Ajv from "ajv";
import type { manifest as makeManifest } from "../../lib/awp/manifest";
type Manifest = ReturnType<typeof makeManifest>;

test("discovery compiles and every declared action exposes the advertised HTTP error contract", async ({
  request,
}) => {
  const response = await request.get("/agent.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  const manifest: Manifest = await response.json();
  expect(await (await request.get("/.well-known/agent.json")).json()).toEqual(
    manifest,
  );
  expect(manifest.awp_version).toBe("0.2");
  expect(manifest.actions.length).toBeGreaterThan(0);
  expect(new Set(manifest.actions.map((action) => action.id)).size).toBe(
    manifest.actions.length,
  );
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const assertError = async (
    result: APIResponse,
    code: keyof Manifest["errors"],
  ) => {
    expect(result.status()).toBe(manifest.errors[code].status);
    expect(result.headers()["content-type"]).toContain("application/json");
    expect(result.headers()["cache-control"]).toBe("no-store");
    const payload = await result.json();
    expect(payload).toEqual({
      error: {
        code,
        message: expect.any(String),
        recovery: manifest.errors[code].recovery,
      },
    });
    expect(payload.error.message.length).toBeGreaterThan(0);
  };
  for (const action of manifest.actions) {
    await test.step(`${action.id}: JSON schemas and invalid-input envelope`, async () => {
      expect(["GET", "POST"]).toContain(action.method);
      expect(action.endpoint).toMatch(/^\/api\/awp\/[a-z/]+$/);
      ajv.compile(action.input_schema);
      ajv.compile(action.output_schema);
      // Unknown fields also exercise strict validation on zero-input list actions.
      const result =
        action.method === "GET"
          ? await request.get(action.endpoint, {
              params: { unexpected_field: "reject me" },
            })
          : await request.post(action.endpoint, {
              data: { unexpected_field: "reject me" },
            });
      await assertError(result, "INVALID_INPUT");
    });
  }
  const endpoint = (id: string) =>
    manifest.actions.find((action) => action.id === id)!.endpoint;
  await assertError(
    await request.post(endpoint("generate_plan"), {
      data: "{",
      headers: { "Content-Type": "application/json" },
    }),
    "INVALID_INPUT",
  );
  await assertError(
    await request.get(endpoint("lookup_scripture"), {
      params: { reference: "John 3:999" },
    }),
    "SCRIPTURE_NOT_FOUND",
  );
  await assertError(
    await request.get(endpoint("get_daily"), {
      params: { planId: "00000000-0000-4000-8000-000000000099" },
    }),
    "NOT_FOUND",
  );
  await assertError(
    await request.post(endpoint("lookup_scripture"), {
      data: { reference: "John 3:16" },
    }),
    "NOT_FOUND",
  );
  await assertError(
    await request.post(endpoint("generate_plan"), {
      data: { prompt: "A prayer journey" },
      headers: { "sec-fetch-site": "cross-site" },
    }),
    "FORBIDDEN",
  );
  await assertError(
    await request.get(endpoint("list_plans"), {
      headers: { Authorization: `Bearer invalid-${crypto.randomUUID()}` },
    }),
    "AUTH_EXPIRED",
  );
});
