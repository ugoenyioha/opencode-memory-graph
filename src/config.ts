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

const embeddings = z.enum(["off", "local", "cloud"]).default("off");
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
const truthlog = z
  .object({
    enabled: z.boolean().default(false),
    path: z.string().min(1).default("~/.opencode/memory/truthlog.sqlite"),
  })
  .default({
    enabled: false,
    path: "~/.opencode/memory/truthlog.sqlite",
  });

export const ConfigSchema = z.object({
  storage: z
    .union([local, remote])
    .default({ mode: "local", path: "~/.opencode/memory" }),
  embeddings,
  default_scope: scope,
  packs,
  proactive,
  truthlog,
});

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigPack = string | Pack;

export function config(input: unknown): Config {
  return ConfigSchema.parse(input ?? {});
}

export function runtime(): Config {
  const mode = process.env.MEMORY_GRAPH_MODE === "remote" ? "remote" : "local";
  const storage =
    mode === "remote"
      ? {
          mode: "remote" as const,
          host: process.env.MEMORY_GRAPH_HOST,
          port: process.env.MEMORY_GRAPH_PORT
            ? Number(process.env.MEMORY_GRAPH_PORT)
            : 6379,
          password: process.env.MEMORY_GRAPH_PASSWORD,
          tls: process.env.MEMORY_GRAPH_TLS === "false" ? false : true,
        }
      : {
          mode: "local" as const,
          path: process.env.MEMORY_GRAPH_PATH ?? "~/.opencode/memory",
        };

  const embeddings =
    process.env.MEMORY_EMBEDDINGS === "local"
      ? "local"
      : process.env.MEMORY_EMBEDDINGS === "cloud"
        ? "cloud"
        : "off";
  const proactive = {
    enabled: process.env.MEMORY_GRAPH_PROACTIVE === "1",
  };
  const truthlog = {
    enabled: process.env.MEMORY_GRAPH_TRUTHLOG === "1",
    path:
      process.env.MEMORY_GRAPH_TRUTHLOG_PATH ??
      "~/.opencode/memory/truthlog.sqlite",
  };
  return config({
    storage,
    embeddings,
    default_scope: "project",
    proactive,
    truthlog,
  });
}
