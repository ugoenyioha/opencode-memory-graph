import { coreLabels } from "./core";
import { builtin, type Pack } from "./packs";

export function registry(input?: Array<string | Pack>) {
  const packs = new Map(builtin.map((pack) => [pack.name, pack]));
  const builtinLabels = new Set<string>([
    ...coreLabels,
    ...builtin.flatMap((item) => item.labels.map((label) => label.name)),
  ]);
  const selected = (input ?? ["coding"]).flatMap((entry) => {
    if (typeof entry === "string") {
      const pack = packs.get(entry);
      if (!pack) throw new Error(`unknown pack: ${entry}`);
      return [pack];
    }
    if (packs.has(entry.name))
      throw new Error(`pack name reserved: ${entry.name}`);
    return [entry];
  });

  const labels = new Set<string>(coreLabels);
  const custom = selected.filter((item) => !packs.has(item.name));
  for (const pack of custom) {
    for (const label of pack.labels) {
      if (builtinLabels.has(label.name)) {
        throw new Error(`label collision: ${label.name}`);
      }
    }
  }
  for (const pack of selected) {
    for (const label of pack.labels) {
      if (labels.has(label.name))
        throw new Error(`label collision: ${label.name}`);
      labels.add(label.name);
    }
  }

  return {
    packs: selected,
    labels: [...labels].sort(),
    has(label: string) {
      return labels.has(label);
    },
  };
}
