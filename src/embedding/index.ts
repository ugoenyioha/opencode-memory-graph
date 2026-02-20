// Embedding provider — wraps @huggingface/transformers v3
//
// Model: all-MiniLM-L6-v2 (384 dims, ~23MB quantized, runs via WASM in Bun)
// Fallback: returns null if model fails to load (search degrades to FTS-only)

let pipeline: ((text: string) => Promise<number[]>) | null = null;
let loading: Promise<void> | null = null;

const MODEL = "Xenova/all-MiniLM-L6-v2";

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
  if (!loading) loading = init();
  await loading;
  if (!pipeline) return null;
  return pipeline(text);
}

export async function embedBatch(
  texts: string[],
): Promise<(number[] | null)[]> {
  return Promise.all(texts.map(embed));
}

export const DIMENSION = 384;
