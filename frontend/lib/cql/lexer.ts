/**
 * CQL Lexer - Tokenizes CQL query strings
 */

import { Token, TokenType, Position, CqlError, CqlResult } from './types';

const KEYWORDS: Record<string, TokenType> = {
  'AND': 'AND',
  'OR': 'OR',
  'NOT': 'NOT',
  'IN': 'IN',
  'and': 'AND',
  'or': 'OR',
  'not': 'NOT',
  'in': 'IN',
};

export class Lexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  private currentPosition(): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.pos,
    };
  }

  private peek(offset: number = 0): string {
    return this.input[this.pos + offset] ?? '\0';
  }

  private advance(): string {
    const ch = this.input[this.pos] ?? '\0';
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) {
      this.advance();
    }
  }

  private readString(): CqlResult<Token> {
    const startPos = this.currentPosition();
    const quote = this.advance(); // consume opening quote
    let value = '';

    while (this.peek() !== '\0' && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    if (this.peek() === '\0') {
      return {
        ok: false,
        error: {
          type: 'syntax_error',
          message: `Unterminated string starting at line ${startPos.line}, column ${startPos.column}`,
          position: startPos,
        },
      };
    }

    this.advance(); // consume closing quote

    return {
      ok: true,
      value: {
        type: 'STRING',
        value,
        position: startPos,
      },
    };
  }

  private readNumber(): Token {
    const startPos = this.currentPosition();
    let value = '';

    // Handle negative numbers
    if (this.peek() === '-') {
      value += this.advance();
    }

    while (/[0-9]/.test(this.peek())) {
      value += this.advance();
    }

    // Handle decimals
    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      value += this.advance(); // consume '.'
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }

    return {
      type: 'NUMBER',
      value,
      position: startPos,
    };
  }

  private readIdentifier(): Token {
    const startPos = this.currentPosition();
    let value = '';

    while (/[a-zA-Z0-9_]/.test(this.peek())) {
      value += this.advance();
    }

    // Check if it's a keyword
    const keywordType = KEYWORDS[value];
    if (keywordType) {
      return {
        type: keywordType,
        value: value.toUpperCase(),
        position: startPos,
      };
    }

    return {
      type: 'IDENT',
      value,
      position: startPos,
    };
  }

  nextToken(): CqlResult<Token> {
    this.skipWhitespace();

    const startPos = this.currentPosition();

    if (this.pos >= this.input.length) {
      return {
        ok: true,
        value: {
          type: 'EOF',
          value: '',
          position: startPos,
        },
      };
    }

    const ch = this.peek();

    // String literals
    if (ch === '"' || ch === "'") {
      return this.readString();
    }

    // Numbers (including negative)
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(this.peek(1)))) {
      return { ok: true, value: this.readNumber() };
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      return { ok: true, value: this.readIdentifier() };
    }

    // Operators and punctuation
    switch (ch) {
      case '(':
        this.advance();
        return { ok: true, value: { type: 'LPAREN', value: '(', position: startPos } };

      case ')':
        this.advance();
        return { ok: true, value: { type: 'RPAREN', value: ')', position: startPos } };

      case ',':
        this.advance();
        return { ok: true, value: { type: 'COMMA', value: ',', position: startPos } };

      case '=':
        this.advance();
        return { ok: true, value: { type: 'EQ', value: '=', position: startPos } };

      case '!':
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          return { ok: true, value: { type: 'NEQ', value: '!=', position: startPos } };
        }
        return {
          ok: false,
          error: {
            type: 'syntax_error',
            message: `Expected '=' after '!' at line ${startPos.line}, column ${startPos.column}`,
            position: startPos,
          },
        };

      case '^':
        this.advance();
        if (this.peek() === '~') {
          this.advance();
          if (this.peek() === '=') {
            this.advance();
            return { ok: true, value: { type: 'STARTS_CI', value: '^~=', position: startPos } };
          }
          return {
            ok: false,
            error: {
              type: 'syntax_error',
              message: `Expected '=' after '^~' at line ${startPos.line}, column ${startPos.column}`,
              position: startPos,
            },
          };
        }
        if (this.peek() === '=') {
          this.advance();
          return { ok: true, value: { type: 'STARTS', value: '^=', position: startPos } };
        }
        return {
          ok: false,
          error: {
            type: 'syntax_error',
            message: `Expected '=' or '~=' after '^' at line ${startPos.line}, column ${startPos.column}`,
            position: startPos,
          },
        };

      case '~':
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          return { ok: true, value: { type: 'EQ_CI', value: '~=', position: startPos } };
        }
        return {
          ok: false,
          error: {
            type: 'syntax_error',
            message: `Expected '=' after '~' at line ${startPos.line}, column ${startPos.column}`,
            position: startPos,
          },
        };

      case '>':
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          return { ok: true, value: { type: 'GTE', value: '>=', position: startPos } };
        }
        return { ok: true, value: { type: 'GT', value: '>', position: startPos } };

      case '<':
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          return { ok: true, value: { type: 'LTE', value: '<=', position: startPos } };
        }
        return { ok: true, value: { type: 'LT', value: '<', position: startPos } };

      default:
        return {
          ok: false,
          error: {
            type: 'syntax_error',
            message: `Unexpected character '${ch}' at line ${startPos.line}, column ${startPos.column}`,
            position: startPos,
          },
        };
    }
  }

  tokenize(): CqlResult<Token[]> {
    const tokens: Token[] = [];

    while (true) {
      const result = this.nextToken();
      if (!result.ok) {
        return result;
      }

      tokens.push(result.value);

      if (result.value.type === 'EOF') {
        break;
      }
    }

    return { ok: true, value: tokens };
  }
}

/**
 * Tokenize a CQL query string
 */
export function tokenize(input: string): CqlResult<Token[]> {
  const lexer = new Lexer(input);
  return lexer.tokenize();
}
