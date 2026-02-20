import type { GraphClient } from "./client";
import { mutation } from "./ids";

const locks = new Map<string, Promise<void>>();

export async function serial<T>(scope: string, fn: () => Promise<T>) {
  const prior = locks.get(scope) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = prior.then(() => gate);
  locks.set(scope, next);

  await prior;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(scope) === next) locks.delete(scope);
  }
}

export async function retry<T>(fn: () => Promise<T>, attempts = 3) {
  const transient = (error: unknown) => {
    const text = String(error).toLowerCase();
    return (
      text.includes("timeout") ||
      text.includes("tempor") ||
      text.includes("transient") ||
      text.includes("connection") ||
      text.includes("reset")
    );
  };

  let i = 0;
  let last: unknown;
  while (i < attempts) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!transient(error)) break;
      i += 1;
      if (i >= attempts) break;
      await new Promise((resolve) =>
        setTimeout(resolve, (2 ** i + Math.random()) * 50),
      );
    }
  }
  throw last;
}

export async function journal(
  db: GraphClient,
  scope: string,
  key: string,
  payload: string,
) {
  const uuid = mutation(`journal:${scope}`, key);
  await db.query(
    `MERGE (j:Journal {uuid: $uuid})
     ON CREATE SET j.scope = $scope, j.key = $key, j.payload = $payload, j.created_at = $now`,
    {
      uuid,
      scope,
      key,
      payload,
      now: Date.now(),
    },
  );
}
