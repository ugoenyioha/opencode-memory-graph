/**
 * CQL (CXDB Query Language) AST Types
 *
 * These types define the Abstract Syntax Tree for CQL queries.
 * They are designed to be serializable to JSON for backend transmission.
 */

// Token types for the lexer
export type TokenType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'IN'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EQ'        // =
  | 'NEQ'       // !=
  | 'STARTS'    // ^=
  | 'EQ_CI'     // ~=
  | 'STARTS_CI' // ^~=
  | 'GT'        // >
  | 'GTE'       // >=
  | 'LT'        // <
  | 'LTE'       // <=
  | 'STRING'
  | 'NUMBER'
  | 'IDENT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: Position;
}

export interface Position {
  line: number;
  column: number;
  offset: number;
}

// AST Node Types
export type Expression =
  | AndExpr
  | OrExpr
  | NotExpr
  | Comparison;

export interface AndExpr {
  type: 'and';
  left: Expression;
  right: Expression;
}

export interface OrExpr {
  type: 'or';
  left: Expression;
  right: Expression;
}

export interface NotExpr {
  type: 'not';
  inner: Expression;
}

export type Operator =
  | 'eq'        // =
  | 'neq'       // !=
  | 'starts'    // ^=
  | 'eq_ci'     // ~=
  | 'starts_ci' // ^~=
  | 'gt'        // >
  | 'gte'       // >=
  | 'lt'        // <
  | 'lte'       // <=
  | 'in';       // IN

export type Value =
  | StringValue
  | NumberValue
  | DateValue
  | ListValue;

export interface StringValue {
  type: 'string';
  value: string;
}

export interface NumberValue {
  type: 'number';
  value: number;
}

export interface DateValue {
  type: 'date';
  value: string;  // ISO-8601 or relative like "-24h"
  relative: boolean;
}

export interface ListValue {
  type: 'list';
  values: Value[];
}

export interface Comparison {
  type: 'comparison';
  field: string;
  operator: Operator;
  value: Value;
}

export interface CqlQuery {
  raw: string;
  ast: Expression;
}

// Error types
export interface CqlError {
  type: 'syntax_error' | 'unknown_field' | 'invalid_operator';
  message: string;
  position: Position;
}

export type CqlResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CqlError };

// Valid field names
export const VALID_FIELDS = [
  'id',
  'tag',
  'title',
  'label',
  'user',
  'service',
  'host',
  'trace_id',
  'parent',
  'root',
  'created',
  'depth',
  'is_live',
] as const;

export type FieldName = typeof VALID_FIELDS[number];

// Field metadata for validation and autocomplete
export interface FieldMeta {
  name: FieldName;
  type: 'string' | 'number' | 'date' | 'boolean';
  operators: Operator[];
  description: string;
}

export const FIELD_METADATA: Record<FieldName, FieldMeta> = {
  id: {
    name: 'id',
    type: 'number',
    operators: ['eq', 'neq', 'in'],
    description: 'Context ID (primary key)',
  },
  tag: {
    name: 'tag',
    type: 'string',
    operators: ['eq', 'neq', 'starts', 'eq_ci', 'starts_ci', 'in'],
    description: 'Client tag / application identifier',
  },
  title: {
    name: 'title',
    type: 'string',
    operators: ['eq', 'neq', 'starts', 'eq_ci', 'starts_ci'],
    description: 'Context title',
  },
  label: {
    name: 'label',
    type: 'string',
    operators: ['eq', 'neq', 'in'],
    description: 'Context labels (array membership)',
  },
  user: {
    name: 'user',
    type: 'string',
    operators: ['eq', 'neq', 'starts', 'eq_ci', 'starts_ci', 'in'],
    description: 'User who created the context (on_behalf_of)',
  },
  service: {
    name: 'service',
    type: 'string',
    operators: ['eq', 'neq', 'starts', 'eq_ci', 'starts_ci', 'in'],
    description: 'Service name that created the context',
  },
  host: {
    name: 'host',
    type: 'string',
    operators: ['eq', 'neq', 'starts', 'eq_ci', 'starts_ci'],
    description: 'Host name where context was created',
  },
  trace_id: {
    name: 'trace_id',
    type: 'string',
    operators: ['eq', 'neq'],
    description: 'Distributed tracing ID',
  },
  parent: {
    name: 'parent',
    type: 'number',
    operators: ['eq', 'neq', 'in'],
    description: 'Parent context ID',
  },
  root: {
    name: 'root',
    type: 'number',
    operators: ['eq', 'neq', 'in'],
    description: 'Root context ID in hierarchy',
  },
  created: {
    name: 'created',
    type: 'date',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    description: 'Creation timestamp (supports relative dates like "-24h")',
  },
  depth: {
    name: 'depth',
    type: 'number',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    description: 'Depth of the head turn in the context',
  },
  is_live: {
    name: 'is_live',
    type: 'boolean',
    operators: ['eq'],
    description: 'Whether context has active SSE connections',
  },
};
