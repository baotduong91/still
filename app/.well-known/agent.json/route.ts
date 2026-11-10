import { manifest } from "@/lib/awp/manifest";
export function GET(request: Request) {
  return Response.json(
    manifest(
      process.env.SITE_URL ??
        `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`,
    ),
  );
}
