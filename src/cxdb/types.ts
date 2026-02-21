export const MUTATION_TYPES = [
  "memory.entity.upsert",
  "memory.entity.supersede",
  "memory.relation.upsert",
  "memory.relation.remove",
  "memory.lesson.create",
  "memory.lesson.quarantine",
  "memory.extraction.batch",
  "memory.scope.change",
  "memory.compaction.snapshot",
  "memory.embedding.update",
] as const;

export type MutationType = (typeof MUTATION_TYPES)[number];

export const MUTATION_TYPE = Object.freeze(
  MUTATION_TYPES.reduce(
    (out, item) => ({
      ...out,
      [item.replaceAll(".", "_").toUpperCase()]: item,
    }),
    {} as Record<string, MutationType>,
  ),
);
