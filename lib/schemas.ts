import { z } from "zod";
export const Translation = z.enum(["CSB", "NLT", "MSG", "NIV", "ESV", "WEB"]);
export type TranslationId = z.infer<typeof Translation>;
export const Verse = z.object({
  book: z.string(),
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
  text: z.string(),
});
export const Passage = z.object({
  reference: z.string(),
  requestedReference: z.string().optional(),
  requestedTranslation: Translation,
  translation: Translation,
  fallback: z.boolean(),
  notice: z.string(),
  attribution: z.string().optional(),
  source: z.enum(["local", "api.bible"]).optional(),
  fumsTokens: z.array(z.string()).optional(),
  verses: z.array(Verse).min(1),
  text: z.string(),
});
export const Day = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  objective: z.string(),
  passage: Passage,
  webPassage: Passage.optional(),
  context: z.string(),
  explanation: z.string(),
  reflection: z.string(),
  connection: z.string(),
  questions: z.array(z.string()).length(2),
  prayer: z.string(),
  action: z.string(),
  journalPrompt: z.string(),
  bridge: z.string(),
  interpretation: z.string(),
  completedAt: z.string().nullable(),
  completedDate: z.string().nullable(),
  practiceResponse: z.string().max(10000).optional(),
});
export const Profile = z.object({
  prompt: z.string(),
  themes: z.array(z.string()).min(1),
  focus: z.string(),
  pace: z.enum(["gentle", "standard"]),
});
export const Plan = z.object({
  id: z.string().uuid(),
  title: z.string(),
  profile: Profile,
  translation: Translation,
  createdAt: z.string(),
  revision: z.number().int(),
  provider: z.string(),
  days: z.array(Day).min(3).max(14),
  feedback: z.array(
    z.object({ day: z.number().int(), text: z.string(), at: z.string() }),
  ),
});
export const GenerateInput = z
  .object({
    prompt: z.string().trim().min(3).max(1200),
    days: z.number().int().min(3).max(14).default(7),
    translation: Translation.default("WEB"),
    provider: z.enum(["curated", "ollama", "cloud"]).default("curated"),
  })
  .strict();
export const LookupInput = z
  .object({
    reference: z.string().trim().min(3).max(100),
    translation: Translation.default("WEB"),
  })
  .strict();
export const SearchInput = z
  .object({
    query: z.string().trim().min(2).max(160),
    translation: Translation.default("WEB"),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const TodayInput = z
  .object({
    planId: z.string().uuid(),
    day: z.coerce.number().int().positive().max(14).optional(),
    translation: Translation.optional(),
  })
  .strict();
export const AdaptInput = z
  .object({
    planId: z.string().uuid(),
    day: z.number().int().min(1).max(14),
    feedback: z.string().trim().min(3).max(1200),
    revision: z.number().int().min(0),
  })
  .strict();
export const CompleteInput = z
  .object({
    planId: z.string().uuid(),
    day: z.number().int().min(1).max(14),
    date: z.iso.date(),
  })
  .strict();
export const JournalInput = z
  .object({
    id: z.string().uuid(),
    text: z.string().trim().min(1).max(10000),
    reference: z.string().max(100).optional(),
    planId: z.string().uuid().optional(),
  })
  .strict();
export const Journal = JournalInput.extend({ createdAt: z.string() });
export const ChatInput = z
  .object({
    question: z.string().trim().min(3).max(1200),
    translation: Translation.default("WEB"),
    provider: z.enum(["curated", "ollama", "cloud"]).default("curated"),
    history: z
      .array(
        z.object({
          question: z.string().max(1200),
          answer: z.string().max(12000),
        }),
      )
      .max(8)
      .default([]),
  })
  .strict();
export const ChatAnswer = z.object({
  answer: z.string(),
  citations: z.array(Passage),
  context: z.string(),
  interpretation: z.string(),
  provider: z.string(),
  limited: z.boolean(),
});
export const TranslationInfo = z.object({
  id: Translation,
  name: z.string(),
  available: z.boolean(),
  preferred: z.boolean(),
  primaryAlternative: z.boolean(),
  license: z.string(),
});
export type PlanType = z.infer<typeof Plan>;
export type DayType = z.infer<typeof Day>;
export type PassageType = z.infer<typeof Passage>;
export type VerseType = z.infer<typeof Verse>;
export type ChatType = z.infer<typeof ChatAnswer>;
export type JournalType = z.infer<typeof Journal>;
