import { z } from "zod";
import { type Pack } from "./ontology/packs";

const local = z.object({
  mode: z.literal("local"),
  path: z.string().min(1).default("~/.opencode/memory"),
});

const remote = z
  .object({
    mode: z.literal("remote"),
    host: z.string().min(1),
    port: z.number().int().positive().default(6379),
    password: z.string().min(1),
    tls: z.literal(true),
  })
  .refine(
    (v) => {
      const host = v.host.trim().toLowerCase();
      return ![
        "localhost",
        "127.0.0.1",
        "::1",
        "0:0:0:0:0:0:0:1",
        "[::1]",
      ].includes(host);
    },
    {
      message: "remote mode requires non-local host",
      path: ["host"],
    },
  );

const embeddings = z.enum(["off", "local"]).default("off");
const scope = z.enum(["project", "session", "global"]).default("project");
const packLabel = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});
const pack = z.object({
  name: z.string().min(1),
  labels: z.array(packLabel).min(1),
});
const packs = z
  .array(z.union([z.enum(["coding", "general", "ops"]), pack]))
  .default(["coding"]);
const proactive = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({ enabled: false });

export const ConfigSchema = z.object({
  storage: z
    .union([local, remote])
    .default({ mode: "local", path: "~/.opencode/memory" }),
  embeddings,
  default_scope: scope,
  packs,
  proactive,
});

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigPack = string | Pack;

export function config(input: unknown): Config {
  return ConfigSchema.parse(input ?? {});
}
