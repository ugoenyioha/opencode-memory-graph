import { Database } from "bun:sqlite";
import type { TruthLog } from "./interface";

type Row = {
  context_id: number;
};

function home(path: string) {
  if (!path.startsWith("~/")) return path;
  const dir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${dir}/${path.slice(2)}`;
}

export class SessionStore {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(home(path), { create: true, strict: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cxdb_session_context (
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        context_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, session_id)
      );
    `);
  }

  get(project_id: string, session_id: string) {
    const row = this.db
      .query(
        `SELECT context_id FROM cxdb_session_context
         WHERE project_id = $project_id
           AND session_id = $session_id`,
      )
      .get({ project_id, session_id }) as Row | null;
    if (!row) return null;
    return Number(row.context_id);
  }

  set(project_id: string, session_id: string, context_id: number) {
    this.db
      .query(
        `INSERT INTO cxdb_session_context (project_id, session_id, context_id, created_at)
         VALUES ($project_id, $session_id, $context_id, $created_at)
         ON CONFLICT(project_id, session_id)
         DO UPDATE SET context_id = excluded.context_id`,
      )
      .run({ project_id, session_id, context_id, created_at: Date.now() });
  }

  ensure(log: TruthLog, project_id: string, session_id: string) {
    const current = this.get(project_id, session_id);
    if (current !== null) return current;
    const ctx = log.createContext();
    this.set(project_id, session_id, ctx.context_id);
    return ctx.context_id;
  }

  fork(
    log: TruthLog,
    project_id: string,
    from_session_id: string,
    to_session_id: string,
  ) {
    const source = this.ensure(log, project_id, from_session_id);
    const head = log.head(source);
    const out = log.forkContext({ from_turn_id: head ?? 0 });
    this.set(project_id, to_session_id, out.context_id);
    return out.context_id;
  }

  close() {
    this.db.close();
  }
}

export function sessions(path: string) {
  return new SessionStore(path);
}
