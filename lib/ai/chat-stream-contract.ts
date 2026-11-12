import { z } from "zod";
import { ChatAnswer, Passage } from "@/lib/schemas";
export const ChatStreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("citations"), passages: z.array(Passage) }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("status"),
    status: z.enum(["connected", "rate-limited", "unavailable"]),
    fallback: z.boolean().optional(),
  }),
  z.object({ type: z.literal("result"), response: ChatAnswer }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEvent>;
