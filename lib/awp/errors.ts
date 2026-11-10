export const errors = {
  SCRIPTURE_NOT_FOUND: {
    status: 404,
    recovery:
      "Verify reference format (John 3:16-18) and retry lookup_scripture.",
  },
  PLAN_GENERATION_FAILED: {
    status: 422,
    recovery:
      "Simplify prompt to a supported theme or switch provider to curated, then retry generate_plan.",
  },
  RATE_LIMITED: { status: 429, recovery: "Wait 60 seconds then retry." },
  AUTH_EXPIRED: {
    status: 401,
    recovery:
      "Refresh your configured bearer credential with the deployment owner, then retry. Anonymous browsers may reload to establish a session.",
  },
  LOCAL_MODEL_UNAVAILABLE: {
    status: 503,
    recovery:
      "Start Ollama or retry later; alternatively explicitly select cloud or curated and retry.",
  },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    recovery: "Verify server model credentials, or select curated and retry.",
  },
  INVALID_INPUT: {
    status: 400,
    recovery: "Correct inputs using the action input_schema and retry.",
  },
  NOT_FOUND: {
    status: 404,
    recovery:
      "Use list_plans for this session, or generate_plan to create a plan.",
  },
  CONFLICT: {
    status: 409,
    recovery: "Reload list_plans and retry with the current revision.",
  },
  FORBIDDEN: {
    status: 403,
    recovery:
      "Use a same-origin browser request or an authorized bearer credential.",
  },
  INTERNAL_ERROR: {
    status: 500,
    recovery:
      "Retry later; inspect server configuration if the error persists.",
  },
} as const;
export type ErrorCode = keyof typeof errors;
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
