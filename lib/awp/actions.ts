import { z } from "zod";
import * as S from "@/lib/schemas";
export const actions = {
  generate_plan: {
    path: "plans/generate",
    method: "POST",
    description:
      "Create and persist a distinct multi-day journey; starts at Day 1.",
    input: S.GenerateInput,
    output: z.object({ plan: S.Plan }),
  },
  get_daily: {
    path: "plans/today",
    method: "GET",
    description:
      "Get an explicit day or the first incomplete day. Calendar days never skip unread material.",
    input: S.TodayInput,
    output: z.object({ day: S.Day, planId: z.string(), complete: z.boolean() }),
  },
  adapt_plan: {
    path: "plans/adapt",
    method: "POST",
    description:
      "Refine only future, uncompleted days from feedback; revision checked.",
    input: S.AdaptInput,
    output: z.object({ plan: S.Plan }),
  },
  lookup_scripture: {
    path: "scripture",
    method: "GET",
    description:
      "Retrieve exact local text with validated references and explicit translation fallback.",
    input: S.LookupInput,
    output: z.object({ passage: S.Passage }),
  },
  search_scripture: {
    path: "scripture/search",
    method: "GET",
    description:
      "Search by reference, curated topic, or all-keyword match; offset pagination.",
    input: S.SearchInput,
    output: z.object({
      results: z.array(S.Passage),
      total: z.number(),
      offset: z.number(),
    }),
  },
  bible_chat: {
    path: "chat",
    method: "POST",
    description:
      "Scripture-grounded discussion; citations are retrieved, never generated.",
    input: S.ChatInput,
    output: S.ChatAnswer,
  },
  create_journal: {
    path: "journal",
    method: "POST",
    description: "Save a private journal entry; id is an idempotency key.",
    input: S.JournalInput,
    output: z.object({ entry: S.Journal }),
  },
  get_translations: {
    path: "translations",
    method: "GET",
    description:
      "CSB preference, NLT primary alternative, installed corpus availability.",
    input: z.object({}).strict(),
    output: z.object({
      translations: z.array(S.TranslationInfo),
      default: S.Translation,
    }),
  },
  complete_day: {
    path: "plans/complete",
    method: "POST",
    description:
      "Idempotently complete a day; preserves the original completion date.",
    input: S.CompleteInput,
    output: z.object({ plan: S.Plan }),
  },
  list_plans: {
    path: "plans",
    method: "GET",
    description:
      "List plans owned by this browser session or bearer principal.",
    input: z.object({}).strict(),
    output: z.object({ plans: z.array(S.Plan) }),
  },
  list_journal: {
    path: "journal",
    method: "GET",
    description: "List this principal’s private journal entries.",
    input: z.object({}).strict(),
    output: z.object({ entries: z.array(S.Journal) }),
  },
} as const;
export type ActionId = keyof typeof actions;
