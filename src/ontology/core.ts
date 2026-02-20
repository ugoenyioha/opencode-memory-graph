export const coreLabels = [
  "Decision",
  "Lesson",
  "Preference",
  "Task",
  "Concept",
] as const;

export type CoreLabel = (typeof coreLabels)[number];
