import { createClient, SCHEMA_FIELD_TYPE, SCHEMA_VECTOR_FIELD_ALGORITHM } from "redis";
import { embed, EMBEDDING_DIM, EMBEDDING_MODEL, vectorBuffer } from "@/lib/embed";
import { sqlAll } from "@/lib/db";

const INDEX = "kb_idx";
const MODEL_KEY = "kb:model";

async function connectRedis() {
  const created = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    socket: { connectTimeout: 2000 },
  });
  created.on("error", () => {
    // The caller surfaces connection failures.
  });
  await created.connect();
  return created;
}

type AppRedis = Awaited<ReturnType<typeof connectRedis>>;

const globalForRedis = globalThis as unknown as {
  __approvalRedis?: AppRedis;
  __approvalRedisIndex?: Promise<void> | null;
};

export type KnowledgeHit = {
  title: string;
  excerpt: string;
};

export type KnowledgeSearch = {
  available: boolean;
  hits: KnowledgeHit[];
  error: string;
};

type StoredDoc = {
  id: number;
  title: string;
  content: string;
};

async function client() {
  if (globalForRedis.__approvalRedis?.isOpen) return globalForRedis.__approvalRedis;
  const created = await connectRedis();
  globalForRedis.__approvalRedis = created;
  return created;
}

function chunksOf(content: string) {
  const text = content.trim();
  if (text.length <= 800) return [text];
  const parts = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current}\n${part}` : part;
    if (next.length > 500 && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, 800)];
}

async function ensureIndex(redis: AppRedis) {
  if (!globalForRedis.__approvalRedisIndex) {
    globalForRedis.__approvalRedisIndex = (async () => {
      const marker = await redis.get(MODEL_KEY);
      let exists = false;
      try {
        await redis.ft.info(INDEX);
        exists = true;
      } catch {
        exists = false;
      }
      if (exists && marker === EMBEDDING_MODEL) return;
      if (exists) {
        try {
          await redis.ft.dropIndex(INDEX);
        } catch {
          // The index is recreated below.
        }
      }
      const stale = await redis.keys("kb:chunk:*");
      if (stale.length > 0) await redis.del(stale);
      await redis.ft.create(
        INDEX,
        {
          title: { type: SCHEMA_FIELD_TYPE.TEXT },
          content: { type: SCHEMA_FIELD_TYPE.TEXT },
          embedding: {
            type: SCHEMA_FIELD_TYPE.VECTOR,
            ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.HNSW,
            TYPE: "FLOAT32",
            DIM: EMBEDDING_DIM,
            DISTANCE_METRIC: "COSINE",
          },
        },
        { ON: "HASH", PREFIX: "kb:chunk:" },
      );
      await redis.set(MODEL_KEY, EMBEDDING_MODEL);
    })().catch((error) => {
      globalForRedis.__approvalRedisIndex = null;
      throw error;
    });
  }
  await globalForRedis.__approvalRedisIndex;
}

let reindexTask: Promise<number> | null = null;

export function reindexAll() {
  if (!reindexTask) {
    reindexTask = reindexAllNow().finally(() => {
      reindexTask = null;
    });
  }
  return reindexTask;
}

async function reindexAllNow() {
  const redis = await client();
  await ensureIndex(redis);
  const docs = sqlAll<StoredDoc>("SELECT id, title, content FROM knowledge_docs ORDER BY id");
  const stale = await redis.keys("kb:chunk:*");
  if (stale.length > 0) await redis.del(stale);
  for (const doc of docs) await writeChunks(redis, doc);
  return docs.length;
}

async function writeChunks(redis: AppRedis, doc: StoredDoc) {
  const stale = await redis.keys(`kb:chunk:${doc.id}:*`);
  if (stale.length > 0) await redis.del(stale);
  const chunks = chunksOf(doc.content);
  for (let index = 0; index < chunks.length; index += 1) {
    const excerpt = chunks[index];
    await redis.hSet(`kb:chunk:${doc.id}:${index}`, {
      doc_id: String(doc.id),
      title: doc.title,
      content: excerpt,
      embedding: vectorBuffer(await embed(`${doc.title}\n${excerpt}`, "passage")),
    });
  }
}

export async function reindexDocument(id: number) {
  const redis = await client();
  await ensureIndex(redis);
  const doc = sqlAll<StoredDoc>("SELECT id, title, content FROM knowledge_docs WHERE id = ?", id)[0];
  if (!doc) {
    const stale = await redis.keys(`kb:chunk:${id}:*`);
    if (stale.length > 0) await redis.del(stale);
    return;
  }
  await writeChunks(redis, doc);
}

export async function removeDocumentVectors(id: number) {
  const redis = await client();
  const stale = await redis.keys(`kb:chunk:${id}:*`);
  if (stale.length > 0) await redis.del(stale);
}

export async function knowledgeStatus() {
  try {
    const redis = await client();
    await redis.ping();
    let documents = 0;
    try {
      const info = await redis.ft.info(INDEX);
      documents = Number(info.num_docs ?? 0);
    } catch {
      documents = 0;
    }
    return { ok: true as const, documents, error: "" };
  } catch (error) {
    return {
      ok: false as const,
      documents: 0,
      error: error instanceof Error ? error.message : "无法连接 Redis",
    };
  }
}

export async function searchKnowledge(query: string): Promise<KnowledgeSearch> {
  try {
    const redis = await client();
    await ensureIndex(redis);
    const indexed = await redis.ft.info(INDEX).catch(() => null);
    if (!indexed || Number(indexed.num_docs ?? 0) === 0) await reindexAll();
    const result = await redis.ft.search(INDEX, "*=>[KNN 4 @embedding $vec AS score]", {
      PARAMS: { vec: vectorBuffer(await embed(query, "query")) },
      DIALECT: 2,
      RETURN: ["title", "content", "score"],
    });
    const ranked = result.documents
      .map((document) => {
        const value = document.value as Record<string, unknown>;
        return {
          title: String(value.title ?? ""),
          excerpt: String(value.content ?? "").slice(0, 700),
          score: Number(value.score ?? 1),
        };
      })
      .filter((item) => item.title && item.excerpt)
      .sort((left, right) => left.score - right.score);
    const best = ranked[0];
    const hits =
      best && best.score <= 0.55
        ? ranked
            .filter((item) => item.score <= best.score + 0.03)
            .slice(0, 2)
            .map(({ title, excerpt }) => ({ title, excerpt }))
        : [];
    return { available: true, hits, error: "" };
  } catch (error) {
    return {
      available: false,
      hits: [],
      error: error instanceof Error ? error.message : "知识库检索失败",
    };
  }
}
