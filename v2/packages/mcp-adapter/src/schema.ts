import { z } from 'zod';
import type { InputSchema, InputDefinition } from '@hashdo/core';

/**
 * Convert a HashDo input schema to a Zod raw shape,
 * which the MCP SDK expects for tool inputSchema.
 */
export function inputSchemaToZodShape(inputs: InputSchema): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, def] of Object.entries(inputs)) {
    shape[name] = inputDefToZod(def);
  }

  return shape;
}

function inputDefToZod(def: InputDefinition): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (def.type) {
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'json':
      schema = z.record(z.string(), z.unknown());
      break;
    case 'string':
    case 'date':
    case 'url':
    case 'email':
    default: {
      let strSchema = z.string();
      if (def.type === 'email') strSchema = strSchema.email();
      if (def.type === 'url') strSchema = strSchema.url();
      schema = strSchema;
      break;
    }
  }

  if (def.enum && def.enum.length > 0) {
    const literals = def.enum.map((v) => z.literal(v as string | number | boolean));
    schema =
      literals.length === 1
        ? literals[0]
        : z.union([literals[0], literals[1], ...literals.slice(2)]);
  }

  // Add description, noting the default so the model can still see it. We do
  // NOT attach `.default()` below: the SDK would materialize it into the parsed
  // params before the handler runs, so defaults would be applied on the MCP
  // path but not the REST path, splitting instance identity/state for any card
  // with a defaulted optional input. defineCard() applies defaults in exactly
  // one place instead.
  if (def.description) {
    const suffix = def.default !== undefined ? ` (default: ${JSON.stringify(def.default)})` : '';
    schema = schema.describe(`${def.description}${suffix}`);
  }

  // Make optional if not required. Defaults are intentionally not applied here.
  if (!def.required) {
    schema = schema.optional();
  }

  return schema;
}
