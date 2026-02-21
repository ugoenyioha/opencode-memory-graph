/**
 * CQL Parser - Recursive descent parser for CQL queries
 *
 * Grammar:
 *   query       = expression ;
 *   expression  = or_expr ;
 *   or_expr     = and_expr { "OR" and_expr } ;
 *   and_expr    = unary_expr { "AND" unary_expr } ;
 *   unary_expr  = [ "NOT" ] primary ;
 *   primary     = comparison | "(" expression ")" ;
 *   comparison  = field operator value ;
 */

import { Lexer } from './lexer';
import {
  Token,
  TokenType,
  Expression,
  Comparison,
  Operator,
  Value,
  StringValue,
  NumberValue,
  ListValue,
  CqlQuery,
  CqlError,
  CqlResult,
  VALID_FIELDS,
  FIELD_METADATA,
  FieldName,
} from './types';

export class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;

  constructor(private input: string) {}

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', position: { line: 1, column: 1, offset: 0 } };
  }

  private peek(offset: number = 0): Token {
    return this.tokens[this.pos + offset] ?? { type: 'EOF', value: '', position: { line: 1, column: 1, offset: 0 } };
  }

  private advance(): Token {
    const token = this.current();
    if (token.type !== 'EOF') {
      this.pos++;
    }
    return token;
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private expect(type: TokenType, message: string): CqlResult<Token> {
    if (this.check(type)) {
      return { ok: true, value: this.advance() };
    }
    return {
      ok: false,
      error: {
        type: 'syntax_error',
        message,
        position: this.current().position,
      },
    };
  }

  parse(): CqlResult<CqlQuery> {
    // Tokenize
    const lexer = new Lexer(this.input);
    const tokenResult = lexer.tokenize();
    if (!tokenResult.ok) {
      return tokenResult;
    }
    this.tokens = tokenResult.value;
    this.pos = 0;

    // Handle empty query
    if (this.check('EOF')) {
      return {
        ok: false,
        error: {
          type: 'syntax_error',
          message: 'Empty query',
          position: this.current().position,
        },
      };
    }

    // Parse expression
    const exprResult = this.parseOrExpr();
    if (!exprResult.ok) {
      return exprResult;
    }

    // Ensure we consumed all tokens
    if (!this.check('EOF')) {
      return {
        ok: false,
        error: {
          type: 'syntax_error',
          message: `Unexpected token '${this.current().value}' after expression`,
          position: this.current().position,
        },
      };
    }

    return {
      ok: true,
      value: {
        raw: this.input,
        ast: exprResult.value,
      },
    };
  }

  private parseOrExpr(): CqlResult<Expression> {
    let left = this.parseAndExpr();
    if (!left.ok) {
      return left;
    }

    while (this.match('OR')) {
      const right = this.parseAndExpr();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        value: {
          type: 'or',
          left: left.value,
          right: right.value,
        },
      };
    }

    return left;
  }

  private parseAndExpr(): CqlResult<Expression> {
    let left = this.parseUnaryExpr();
    if (!left.ok) {
      return left;
    }

    while (this.match('AND')) {
      const right = this.parseUnaryExpr();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        value: {
          type: 'and',
          left: left.value,
          right: right.value,
        },
      };
    }

    return left;
  }

  private parseUnaryExpr(): CqlResult<Expression> {
    if (this.match('NOT')) {
      const inner = this.parsePrimary();
      if (!inner.ok) {
        return inner;
      }
      return {
        ok: true,
        value: {
          type: 'not',
          inner: inner.value,
        },
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): CqlResult<Expression> {
    // Parenthesized expression
    if (this.match('LPAREN')) {
      const expr = this.parseOrExpr();
      if (!expr.ok) {
        return expr;
      }
      const closeResult = this.expect('RPAREN', "Expected ')' after expression");
      if (!closeResult.ok) {
        return closeResult;
      }
      return expr;
    }

    // Comparison
    return this.parseComparison();
  }

  private parseComparison(): CqlResult<Comparison> {
    // Field name
    if (!this.check('IDENT')) {
      return {
        ok: false,
        error: {
          type: 'syntax_error',
          message: `Expected field name, got '${this.current().value}'`,
          position: this.current().position,
        },
      };
    }

    const fieldToken = this.advance();
    const fieldName = fieldToken.value;

    // Validate field name
    if (!VALID_FIELDS.includes(fieldName as FieldName)) {
      return {
        ok: false,
        error: {
          type: 'unknown_field',
          message: `Unknown field '${fieldName}'. Valid fields: ${VALID_FIELDS.join(', ')}`,
          position: fieldToken.position,
        },
      };
    }

    // Operator
    const operatorResult = this.parseOperator();
    if (!operatorResult.ok) {
      return operatorResult;
    }
    const operator = operatorResult.value;

    // Validate operator for field type
    const fieldMeta = FIELD_METADATA[fieldName as FieldName];
    if (!fieldMeta.operators.includes(operator)) {
      return {
        ok: false,
        error: {
          type: 'invalid_operator',
          message: `Operator '${operator}' is not valid for field '${fieldName}'. Valid operators: ${fieldMeta.operators.join(', ')}`,
          position: this.peek(-1).position,
        },
      };
    }

    // Value
    const valueResult = operator === 'in' ? this.parseList() : this.parseValue(fieldMeta.type);
    if (!valueResult.ok) {
      return valueResult;
    }

    return {
      ok: true,
      value: {
        type: 'comparison',
        field: fieldName,
        operator,
        value: valueResult.value,
      },
    };
  }

  private parseOperator(): CqlResult<Operator> {
    const token = this.current();
    const pos = token.position;

    switch (token.type) {
      case 'EQ':
        this.advance();
        return { ok: true, value: 'eq' };
      case 'NEQ':
        this.advance();
        return { ok: true, value: 'neq' };
      case 'STARTS':
        this.advance();
        return { ok: true, value: 'starts' };
      case 'EQ_CI':
        this.advance();
        return { ok: true, value: 'eq_ci' };
      case 'STARTS_CI':
        this.advance();
        return { ok: true, value: 'starts_ci' };
      case 'GT':
        this.advance();
        return { ok: true, value: 'gt' };
      case 'GTE':
        this.advance();
        return { ok: true, value: 'gte' };
      case 'LT':
        this.advance();
        return { ok: true, value: 'lt' };
      case 'LTE':
        this.advance();
        return { ok: true, value: 'lte' };
      case 'IN':
        this.advance();
        return { ok: true, value: 'in' };
      default:
        return {
          ok: false,
          error: {
            type: 'syntax_error',
            message: `Expected operator, got '${token.value}'`,
            position: pos,
          },
        };
    }
  }

  private parseValue(fieldType: 'string' | 'number' | 'date' | 'boolean'): CqlResult<Value> {
    const token = this.current();

    if (token.type === 'STRING') {
      this.advance();
      const strValue = token.value;

      // Check if it's a date value for date fields
      if (fieldType === 'date') {
        // Relative date patterns: -24h, -7d, -30m
        const relativePattern = /^-(\d+)([hdm])$/;
        if (relativePattern.test(strValue)) {
          return {
            ok: true,
            value: {
              type: 'date',
              value: strValue,
              relative: true,
            },
          };
        }
        // ISO-8601 or date-only format
        return {
          ok: true,
          value: {
            type: 'date',
            value: strValue,
            relative: false,
          },
        };
      }

      return {
        ok: true,
        value: {
          type: 'string',
          value: strValue,
        } as StringValue,
      };
    }

    if (token.type === 'NUMBER') {
      this.advance();
      const numValue = parseFloat(token.value);
      if (isNaN(numValue)) {
        return {
          ok: false,
          error: {
            type: 'syntax_error',
            message: `Invalid number '${token.value}'`,
            position: token.position,
          },
        };
      }
      return {
        ok: true,
        value: {
          type: 'number',
          value: numValue,
        } as NumberValue,
      };
    }

    // Handle boolean values for boolean fields
    if (token.type === 'IDENT' && fieldType === 'boolean') {
      const boolStr = token.value.toLowerCase();
      if (boolStr === 'true' || boolStr === 'false') {
        this.advance();
        return {
          ok: true,
          value: {
            type: 'string',
            value: boolStr,
          } as StringValue,
        };
      }
    }

    return {
      ok: false,
      error: {
        type: 'syntax_error',
        message: `Expected value, got '${token.value}'`,
        position: token.position,
      },
    };
  }

  private parseList(): CqlResult<ListValue> {
    const openResult = this.expect('LPAREN', "Expected '(' after IN");
    if (!openResult.ok) {
      return openResult;
    }

    const values: Value[] = [];

    // First value
    const firstResult = this.parseValue('string');
    if (!firstResult.ok) {
      return firstResult;
    }
    values.push(firstResult.value);

    // Additional values
    while (this.match('COMMA')) {
      const valueResult = this.parseValue('string');
      if (!valueResult.ok) {
        return valueResult;
      }
      values.push(valueResult.value);
    }

    const closeResult = this.expect('RPAREN', "Expected ')' after list values");
    if (!closeResult.ok) {
      return closeResult;
    }

    return {
      ok: true,
      value: {
        type: 'list',
        values,
      },
    };
  }
}

/**
 * Parse a CQL query string into an AST
 */
export function parse(input: string): CqlResult<CqlQuery> {
  const parser = new Parser(input);
  return parser.parse();
}

/**
 * Validate a CQL query string without returning the AST
 */
export function validate(input: string): CqlResult<true> {
  const result = parse(input);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: true };
}
