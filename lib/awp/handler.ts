import { resolvePassage } from "@/lib/bible/api-bible";
import { ZodError } from "zod";
import * as S from "@/lib/schemas";
import { actions, type ActionId } from "./actions";
import { identify } from "./auth";
import { rateLimit } from "./rate-limit";
import { AppError, errors } from "./errors";
import { generatePlan, chat } from "@/lib/ai/server";
import { getBible, translations } from "@/lib/bible/server";
import { adaptPlan } from "@/lib/ai/orchestrator";
import { themes } from "@/lib/ai/themes";
import * as repo from "@/lib/db/repository";
export async function execute(
  id: ActionId,
  raw: unknown,
  owner: string,
): Promise<unknown> {
  switch (id) {
    case "generate_plan":
      return { plan: await repo.savePlan(owner, await generatePlan(raw)) };
    case "list_plans":
      return { plans: await repo.listPlans(owner) };
    case "get_daily": {
      const input = S.TodayInput.parse(raw);
      const plan = await repo.getPlan(owner, input.planId);
      const day = input.day
        ? plan.days[input.day - 1]
        : (plan.days.find((d) => !d.completedAt) ?? plan.days.at(-1));
      if (!day) throw new AppError("NOT_FOUND", "Day not found.");
      const translation = input.translation ?? plan.translation;
      const passage = await resolvePassage(day.passage.reference, translation);
      return {
        day: { ...day, passage },
        planId: plan.id,
        complete: plan.days.every((d) => d.completedAt),
      };
    }
    case "adapt_plan": {
      const input = S.AdaptInput.parse(raw);
      const plan = await repo.getPlan(owner, input.planId);
      if (plan.revision !== input.revision)
        throw new AppError(
          "CONFLICT",
          "Reload the latest plan before adapting.",
        );
      return {
        plan: await repo.savePlan(
          owner,
          adaptPlan(plan, input.day, input.feedback),
          input.revision,
        ),
      };
    }
    case "complete_day": {
      const input = S.CompleteInput.parse(raw);
      const plan = await repo.getPlan(owner, input.planId);
      const day = plan.days[input.day - 1];
      if (!day) throw new AppError("INVALID_INPUT", "Day not found.");
      if (day.completedAt) return { plan };
      day.completedAt = new Date().toISOString();
      day.completedDate = input.date;
      const revision = plan.revision++;
      return { plan: await repo.savePlan(owner, plan, revision) };
    }
    case "lookup_scripture": {
      const input = S.LookupInput.parse(raw);
      return {
        passage: await resolvePassage(input.reference, input.translation),
      };
    }
    case "search_scripture": {
      const input = S.SearchInput.parse(raw);
      const bible = await getBible(input.translation);
      const theme = themes[input.query.toLowerCase()];
      const found = theme
        ? {
            results: theme.lessons
              .slice(input.offset, input.offset + input.limit)
              .map((l) => bible.lookup(l.reference, input.translation)),
            total: theme.lessons.length,
            offset: input.offset,
          }
        : bible.search(
            input.query,
            input.translation,
            input.offset,
            input.limit,
          );
      return {
        ...found,
        results: await Promise.all(
          found.results.map((p) =>
            resolvePassage(p.reference, input.translation),
          ),
        ),
      };
    }
    case "bible_chat":
      return chat(raw);
    case "create_journal": {
      const input = S.JournalInput.parse(raw);
      if (input.reference)
        (await getBible("WEB")).lookup(input.reference, "WEB");
      if (input.planId) await repo.getPlan(owner, input.planId);
      return {
        entry: await repo.saveJournal(owner, {
          ...input,
          createdAt: new Date().toISOString(),
        }),
      };
    }
    case "list_journal":
      return { entries: await repo.listJournal(owner) };
    case "get_translations":
      return { translations: await translations(), default: "WEB" };
  }
}
export async function handle(request: Request, path: string) {
  let cookie: string | null = null;
  try {
    const match = Object.entries(actions).find(
      ([, a]) => a.path === path && a.method === request.method,
    );
    if (!match)
      throw new AppError("NOT_FOUND", "Unknown action or HTTP method.");
    const [id, action] = match;
    const identity = await identify(request);
    cookie = identity.cookie;
    await rateLimit(identity.owner);
    let raw: unknown;
    if (request.method === "GET")
      raw = Object.fromEntries(new URL(request.url).searchParams);
    else {
      const body = await request.text();
      if (Buffer.byteLength(body) > 32768)
        throw new AppError("INVALID_INPUT", "Request exceeds 32 KiB.");
      try {
        raw = JSON.parse(body);
      } catch {
        throw new AppError("INVALID_INPUT", "Request body must be JSON.");
      }
    }
    const parsed = action.input.parse(raw);
    const result = await execute(id as ActionId, parsed, identity.owner);
    action.output.parse(result);
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    });
  } catch (error) {
    const app =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError(
              "INVALID_INPUT",
              error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "),
            )
          : new AppError(
              "INTERNAL_ERROR",
              "The request could not be completed.",
            );
    return Response.json(
      {
        error: {
          code: app.code,
          message: app.message,
          recovery: errors[app.code].recovery,
        },
      },
      {
        status: errors[app.code].status,
        headers: {
          "Cache-Control": "no-store",
          ...(cookie ? { "Set-Cookie": cookie } : {}),
          ...(app.code === "RATE_LIMITED" ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
