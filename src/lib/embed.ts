import path from "node:path";

export const EMBEDDING_MODEL = "Xenova/bge-large-zh-v1.5";
export const EMBEDDING_DIM = 1024;

const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";

type Extractor = (text: string, options: { pooling: "mean"; normalize: true }) => Promise<{ data: ArrayLike<number> }>;

type TransformersModule = {
  env: { cacheDir: string };
  pipeline: (
    task: "feature-extraction",
    model: string,
    options: { dtype: "q4"; device: "cpu" },
  ) => Promise<Extractor>;
};

let extractorPromise: Promise<Extractor> | null = null;

async function loadTransformers() {
  const load = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<TransformersModule>;
  return load("@huggingface/transformers");
}

async function extractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { env, pipeline } = await loadTransformers();
      env.cacheDir = path.join(process.cwd(), ".cache", "transformers");
      if (!process.env.HF_ENDPOINT) process.env.HF_ENDPOINT = "https://hf-mirror.com";
      process.env.HF_HUB_DISABLE_XET = "1";
      return pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q4", device: "cpu" });
    })();
  }
  return extractorPromise;
}

export async function embed(text: string, kind: "query" | "passage" = "passage") {
  const pipe = await extractor();
  const input = kind === "query" ? `${QUERY_PREFIX}${text}` : text;
  const output = await pipe(input, { pooling: "mean", normalize: true });
  return Float32Array.from(output.data).slice(0, EMBEDDING_DIM);
}

export function vectorBuffer(vector: Float32Array) {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}
