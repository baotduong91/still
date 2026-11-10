import { handle } from "@/lib/awp/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  return handle(request, (await context.params).path.join("/"));
}
export const POST = GET;
