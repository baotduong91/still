import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";
let secretPromise: Promise<string> | undefined;
function secret() {
  return (secretPromise ??= (async () => {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    const dir = path.resolve(process.env.DATA_DIR ?? ".data");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, "session-secret");
    try {
      await writeFile(file, randomBytes(48).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return readFile(file, "utf8");
  })());
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function identify(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth) {
    if (
      !process.env.AWP_TOKEN ||
      !equal(auth, `Bearer ${process.env.AWP_TOKEN}`)
    )
      throw new AppError("AUTH_EXPIRED", "Invalid bearer credential.");
    return { owner: "agent-owner", cookie: null };
  }
  const origin = request.headers.get("origin");
  const expected =
    process.env.SITE_URL ??
    `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`;
  if (origin && origin !== expected)
    throw new AppError("FORBIDDEN", "Cross-origin requests are not permitted.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("FORBIDDEN", "Cross-site requests are not permitted.");
  const key = await secret();
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("still_session="))
    ?.slice(14);
  if (raw) {
    const [id, signature] = raw.split(".");
    if (
      /^[0-9a-f-]{36}$/.test(id) &&
      signature &&
      equal(signature, createHmac("sha256", key).update(id).digest("hex"))
    )
      return { owner: id, cookie: null };
  }
  const id = crypto.randomUUID();
  const signature = createHmac("sha256", key).update(id).digest("hex");
  return {
    owner: id,
    cookie: `still_session=${id}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(expected).protocol === "https:" ? "; Secure" : ""}`,
  };
}
