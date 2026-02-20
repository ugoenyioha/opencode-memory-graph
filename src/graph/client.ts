// FalkorDB connection — local (falkordblite) or remote (falkordb)
//
// Both modes return the same Graph type from the `falkordb` package,
// so the rest of the codebase doesn't care which mode is active.
// Embedded mode is the default and primary path.

const GRAPH_NAME = "memory";

export type GraphClient = {
  query: (
    cypher: string,
    params?: Record<
      string,
      string | number | boolean | null | string[] | number[]
    >,
  ) => Promise<unknown>;
  roQuery: (
    cypher: string,
    params?: Record<
      string,
      string | number | boolean | null | string[] | number[]
    >,
  ) => Promise<unknown>;
  close: () => Promise<void>;
};

export type Config = {
  mode: "local" | "remote";
  // local mode
  path?: string;
  // remote mode
  host?: string;
  port?: number;
  password?: string;
  tls?: boolean;
};

const defaults: Config = {
  mode: "local",
  path: "~/.opencode/memory",
};

export async function connect(config: Config = defaults): Promise<GraphClient> {
  if (config.mode === "remote") {
    const { FalkorDB } = await import("falkordb");
    const db = await FalkorDB.connect({
      socket: {
        host: config.host ?? "localhost",
        port: config.port ?? 6379,
      },
      password: config.password,
    });
    const graph = db.selectGraph(GRAPH_NAME);
    return {
      query: (cypher, params) => graph.query(cypher, { params }),
      roQuery: (cypher, params) => graph.roQuery(cypher, { params }),
      close: () => db.close(),
    };
  }

  // Embedded mode — zero-config local FalkorDB via falkordblite
  const { FalkorDB } = await import("falkordblite");
  const db = await FalkorDB.open({
    path: config.path ?? defaults.path,
  });
  const graph = db.selectGraph(GRAPH_NAME);
  return {
    query: (cypher, params) => graph.query(cypher, { params }),
    roQuery: (cypher, params) => graph.roQuery(cypher, { params }),
    close: () => db.close(),
  };
}
