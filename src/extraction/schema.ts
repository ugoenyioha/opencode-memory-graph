import { z } from "zod";
import { registry } from "../ontology/registry";
import { type Pack } from "../ontology/packs";

const attributes = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional();

const entity = z
  .object({
    action: z.enum(["create", "update", "delete"]),
    uuid: z.string().optional(),
    name: z.string().optional(),
    label_type: z.string().optional(),
    summary: z.string().optional(),
    attributes,
    scope: z.enum(["global", "project", "session"]).optional(),
    source: z.enum(["auto", "user", "import", "inferred"]).optional(),
    confidence: z.enum(["confirmed", "suspected", "speculative"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "create" && (!value.name || !value.label_type)) {
      ctx.addIssue({
        code: "custom",
        message: "create requires name and label_type",
      });
    }
    if (
      (value.action === "update" || value.action === "delete") &&
      !value.uuid
    ) {
      ctx.addIssue({
        code: "custom",
        message: `${value.action} requires uuid`,
      });
    }
  });

const relationship = z.object({
  source_name: z.string().min(1),
  target_name: z.string().min(1),
  name: z.string().min(1),
  fact: z.string().min(1),
});

export const ExtractionSchema = z.object({
  entities: z.array(entity).max(200),
  relationships: z.array(relationship).max(500),
});

function extractionSchemaForPacks(packs?: Array<string | Pack>) {
  const labels = new Set(registry(packs).labels);
  return z.object({
    entities: z
      .array(
        entity.superRefine((value, ctx) => {
          if (!value.label_type) return;
          if (labels.has(value.label_type)) return;
          ctx.addIssue({
            code: "custom",
            path: ["label_type"],
            message: `unknown label_type: ${value.label_type}`,
          });
        }),
      )
      .max(200),
    relationships: z.array(relationship).max(500),
  });
}

export function extraction(input: unknown) {
  return ExtractionSchema.parse(input);
}

export function extractionWithPacks(
  input: unknown,
  packs?: Array<string | Pack>,
) {
  return extractionSchemaForPacks(packs).parse(input);
}
