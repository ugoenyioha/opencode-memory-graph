function hash(value: string) {
  const h = new Bun.CryptoHasher("sha256");
  h.update(value);
  return h.digest("hex").slice(0, 24);
}

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function entity(label: string, name: string) {
  return `ent_${hash(`${norm(label)}|${norm(name)}`)}`;
}

export function relation(source: string, name: string, target: string) {
  return `rel_${hash(`${source}|${norm(name)}|${target}`)}`;
}

export function mutation(scope: string, key: string) {
  return `mut_${hash(`${norm(scope)}|${norm(key)}`)}`;
}
