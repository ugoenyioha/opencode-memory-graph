export type Turn = {
  turn_id: number;
  context_id: number;
  parent_turn_id: number | null;
  idx: number;
  at: number;
  type_id: string;
  type_version: number;
  payload_hash: string;
  idempotency_key: string | null;
};

export type Context = {
  context_id: number;
  parent_context_id: number | null;
  head_turn_id: number | null;
  watermark: number;
  created_at: number;
};

export type AppendInput = {
  context_id: number;
  parent_turn_id?: number | null;
  at?: number;
  type_id: string;
  type_version: number;
  payload: unknown;
  idempotency_key?: string;
};

export type RegisterInput = {
  type_id: string;
  type_version: number;
  descriptor: unknown;
};

export interface TruthLog {
  createContext(input?: { at?: number }): Context;
  forkContext(input: { from_context_id: number; at?: number }): Context;
  contexts(input?: { limit?: number }): Context[];
  append(input: AppendInput): Turn;
  turns(context_id: number, input?: { after?: number; limit?: number }): Turn[];
  payload(payload_hash: string): Uint8Array | null;
  project(
    payload_hash: string,
    type_id: string,
    type_version: number,
  ): unknown | null;
  register(input: RegisterInput): void;
  head(context_id: number): number | null;
  watermark(context_id: number): number;
  setWatermark(context_id: number, value: number): void;
  close(): void;
}
