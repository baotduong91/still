import { it, expect } from "vitest";
import { createPin, verifyPin } from "@/lib/client/pin";
it("stores only a salted derived verifier and rejects wrong PINs", async () => {
  const a = await createPin("123456"),
    b = await createPin("123456");
  expect(a.hash).not.toBe(b.hash);
  expect(a.hash).toHaveLength(64);
  expect(a.salt).toHaveLength(32);
  expect(JSON.stringify(a)).not.toContain("123456");
  expect(await verifyPin("123456", a)).toBe(true);
  expect(await verifyPin("654321", a)).toBe(false);
});
it("requires six to twelve numeric digits", async () => {
  await expect(createPin("1234")).rejects.toThrow();
  await expect(createPin("abcdef")).rejects.toThrow();
});
