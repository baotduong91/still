import { handle } from "@/lib/awp/handler";
export function POST(request: Request) {
  return handle(request, "chat");
}
