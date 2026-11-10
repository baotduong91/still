import { handle } from "@/lib/awp/handler";
export function GET(request: Request) {
  return handle(request, "scripture");
}
