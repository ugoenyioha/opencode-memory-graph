// Embedding provider — wraps @huggingface/transformers v3
//
// Model: all-MiniLM-L6-v2 (384 dims, ~23MB quantized, runs via WASM in Bun)
// Fallback: returns null if model fails to load (search degrades to FTS-only)

let pipeline: ((text: string) => Promise<number[]>) | null = null;
let loading: Promise<void> | null = null;
const failed = new Set<string>();

const MODEL = "Xenova/all-MiniLM-L6-v2";

function enabled() {
  return mode() !== "off";
}

function mode() {
  if (process.env.MEMORY_EMBEDDINGS === "local") return "local" as const;
  if (process.env.MEMORY_EMBEDDINGS === "cloud") return "cloud" as const;
  return "off" as const;
}

function list() {
  return (process.env.MEMORY_EMBED_PROVIDERS ?? "openai,voyage")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function vec(data: unknown) {
  if (!Array.isArray(data)) return null;
  const out = data.filter((item) => typeof item === "number") as number[];
  if (out.length === 0) return null;
  return out;
}

async function openai(text: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const url =
    process.env.MEMORY_EMBED_OPENAI_URL ??
    "https://api.openai.com/v1/embeddings";
  const model =
    process.env.MEMORY_EMBED_OPENAI_MODEL ?? "text-embedding-3-small";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ embedding?: unknown }> };
  return vec(json.data?.[0]?.embedding);
}

async function voyage(text: string) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  const url =
    process.env.MEMORY_EMBED_VOYAGE_URL ??
    "https://api.voyageai.com/v1/embeddings";
  const model = process.env.MEMORY_EMBED_VOYAGE_MODEL ?? "voyage-3-lite";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input: [text] }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ embedding?: unknown }> };
  return vec(json.data?.[0]?.embedding);
}

async function fallback(text: string) {
  for (const item of list()) {
    try {
      const out =
        item === "openai"
          ? await openai(text)
          : item === "voyage"
            ? await voyage(text)
            : null;
      if (out) return out;
    } catch {
      if (!failed.has(item)) {
        failed.add(item);
        console.warn(`[memory] embedding provider failed: ${item}`);
      }
    }
  }
  return null;
}

async function init() {
  try {
    const { pipeline: createPipeline } = await import(
      "@huggingface/transformers"
    );
    const extractor = await createPipeline("feature-extraction", MODEL, {
      dtype: "q8",
    } as Record<string, unknown>);
    pipeline = async (text: string) => {
      const result = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      return Array.from(result.data as Float32Array);
    };
  } catch {
    console.warn(
      "[memory] Failed to load embedding model, falling back to FTS-only",
    );
    pipeline = null;
  }
}

export async function embed(text: string): Promise<number[] | null> {
  const current = mode();
  if (current === "off") return null;
  if (current === "local") {
    if (!loading) loading = init();
    await loading;
    if (pipeline) return pipeline(text);
  }
  return fallback(text);
}

export async function embedBatch(
  texts: string[],
): Promise<(number[] | null)[]> {
  return Promise.all(texts.map(embed));
}

export const DIMENSION = 384;

export function status() {
  const current = mode();
  if (current === "off") return "disabled" as const;
  if (current === "cloud") return "cloud" as const;
  if (!loading) return "not_loaded" as const;
  if (!pipeline) return "failed" as const;
  return "ready" as const;
}

export function reset() {
  pipeline = null;
  loading = null;
  failed.clear();
}
