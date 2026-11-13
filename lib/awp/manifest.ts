import { z } from "zod";
import { actions } from "./actions";
import { errors } from "./errors";

type Schema = {
  type?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
};

export function manifest(origin: string) {
  const entities: Record<string, { fields: Record<string, string> }> = {};
  function typeOf(schema: Schema, name: string): string {
    if (schema.anyOf)
      return typeOf(
        schema.anyOf.find((s) => s.type !== "null") ?? schema.anyOf[0],
        name,
      );
    if (schema.enum) return `enum[${schema.enum.join(", ")}]`;
    if (schema.type === "array") {
      const inner = typeOf(schema.items ?? {}, `${name}_item`);
      return `array[${inner.startsWith("object[") ? inner.slice(7, -1) : inner}]`;
    }
    if (schema.type === "object" || schema.properties) {
      entities[name] = {
        fields: Object.fromEntries(
          Object.entries(schema.properties ?? {}).map(([key, value]) => [
            key,
            typeOf(value, `${name}_${key}`),
          ]),
        ),
      };
      return `object[${name}]`;
    }
    return schema.type === "number" ? "float" : (schema.type ?? "string");
  }
  const declarations = Object.entries(actions).map(([id, a]) => {
    const inputSchema = z.toJSONSchema(a.input, {
      target: "draft-7",
      io: "input",
    });
    const outputSchema = z.toJSONSchema(a.output, { target: "draft-7" });
    const input = inputSchema as Schema,
      output = outputSchema as Schema;
    return {
      id,
      description: a.description,
      auth_required: false,
      inputs: Object.fromEntries(
        Object.entries(input.properties ?? {}).map(([name, schema]) => [
          name,
          {
            type: schema.enum ? "enum" : typeOf(schema, `${id}_input_${name}`),
            required: input.required?.includes(name) ?? false,
            ...(schema.enum ? { options: schema.enum } : {}),
            ...(schema.default !== undefined
              ? { default: schema.default }
              : {}),
          },
        ]),
      ),
      outputs: Object.fromEntries(
        Object.entries(output.properties ?? {}).map(([name, schema]) => [
          name,
          typeOf(schema, `${id}_${name}`),
        ]),
      ),
      input_schema: inputSchema,
      output_schema: outputSchema,
      endpoint: `/api/awp/${a.path}`,
      method: a.method,
      execution_model: "sync",
      rate_limit: "120/minute",
      sensitivity: id === "adapt_plan" ? "destructive" : "standard",
      reversible: true,
      idempotency: {
        supported: ["create_journal", "complete_day"].includes(id),
        ...(id === "create_journal"
          ? { key_field: "id", window: "persistent" }
          : {}),
      },
    };
  });
  return {
    awp_version: "0.2",
    domain: new URL(origin).host,
    intent:
      "Still — personal Scripture reading, devotional journeys, prayer, and reflection.",
    capabilities: {
      streaming: false,
      batch_actions: false,
      webhooks: false,
      pagination: "offset",
      idempotency: false,
    },
    auth: {
      type: "bearer",
      required_for: [],
      optional_for: Object.keys(actions),
      note: "Signed anonymous browser session by default. Optional configured AWP_TOKEN maps to a separate agent principal. No OAuth refresh endpoint; replace a revoked key with the owner.",
    },
    entities,
    actions: declarations,
    errors,
    dependencies: {
      adapt_plan: ["generate_plan"],
      get_daily: ["generate_plan"],
      complete_day: ["generate_plan"],
    },
    agent_hints: {
      translation:
        "Omit translation to use the server default from get_translations (DEFAULT_TRANSLATION or the first configured API.Bible edition). UI readers still need explicit online Scripture opt-in; agents resolve licensed text when the server is configured.",
      privacy:
        "Send sensitive prompts to cloud only with the user’s explicit choice. Curated is the default.",
      schema:
        "input_schema and output_schema are full JSON Schema draft-7 extensions; GET inputs use URL query parameters. Nullable fields are specified precisely in output_schema.",
      rate_limit:
        "120 requests per minute per principal, shared across actions.",
      retry:
        "Generate is not idempotent. Use list_plans after an uncertain timeout before retrying.",
    },
  };
}
