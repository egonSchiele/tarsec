import {
  seqC,
  capture,
  optional,
  many1Till,
  or,
  manyTillStr,
  count,
  many,
  many1,
  sepBy,
  seq,
  manyTillOneOf,
  captureCaptures,
  map,
  not,
} from "@/lib/combinators";
import {
  str,
  spaces,
  word,
  char,
  eof,
  space,
  set,
  oneOf,
  regexParser,
  anyChar,
  digit,
  alphanum,
  noneOf,
} from "@/lib/parsers";
import { Parser, ParserResult, success, failure } from "@/lib/types";

/* Python parser using Tarsec */

/* Types */

// Base types
type Expression =
  | Literal
  | Identifier
  | BinaryExpression
  | CallExpression
  | ListExpression
  | DictExpression
  | TupleExpression
  | SubscriptExpression
  | AttributeExpression;

type Statement =
  | AssignmentStatement
  | FunctionDeclaration
  | ClassDeclaration
  | IfStatement
  | WhileStatement
  | ForStatement
  | ImportStatement
  | ReturnStatement
  | PassStatement
  | BreakStatement
  | ContinueStatement
  | WithStatement
  | TryStatement
  | RaiseStatement;

// Literals
type Literal = NumberLiteral | StringLiteral | BooleanLiteral | NoneLiteral;

type NumberLiteral = {
  type: "number-literal";
  value: string;
};

type StringLiteral = {
  type: "string-literal";
  value: string;
};

type BooleanLiteral = {
  type: "boolean-literal";
  value: boolean;
};

type NoneLiteral = {
  type: "none-literal";
  value: null;
};

// Expressions
type Identifier = {
  type: "identifier";
  name: string;
};

type BinaryExpression = {
  type: "binary-expression";
  operator: string;
  left: Expression;
  right: Expression;
};

type CallExpression = {
  type: "call-expression";
  callee: Expression;
  arguments: Expression[];
};

type ListExpression = {
  type: "list-expression";
  elements: Expression[];
};

type DictExpression = {
  type: "dict-expression";
  entries: { key: Expression; value: Expression }[];
};

type TupleExpression = {
  type: "tuple-expression";
  elements: Expression[];
};

type SubscriptExpression = {
  type: "subscript-expression";
  object: Expression;
  index: Expression;
};

type AttributeExpression = {
  type: "attribute-expression";
  object: Expression;
  attribute: string;
};

// Statements
type AssignmentStatement = {
  type: "assignment-statement";
  target: Expression;
  value: Expression;
};

type FunctionDeclaration = {
  type: "function-declaration";
  name: string;
  parameters: Parameter[];
  body: Statement[];
};

type Parameter = {
  name: string;
  defaultValue?: Expression;
};

type ClassDeclaration = {
  type: "class-declaration";
  name: string;
  bases: Expression[];
  body: Statement[];
};

type IfStatement = {
  type: "if-statement";
  test: Expression;
  consequent: Statement[];
  alternate?: Statement[];
};

type WhileStatement = {
  type: "while-statement";
  test: Expression;
  body: Statement[];
};

type ForStatement = {
  type: "for-statement";
  variable: Expression;
  iterable: Expression;
  body: Statement[];
};

type ImportStatement = {
  type: "import-statement";
  module: string;
  names?: string[];
  alias?: string;
};

type ReturnStatement = {
  type: "return-statement";
  value?: Expression;
};

type PassStatement = {
  type: "pass-statement";
};

type BreakStatement = {
  type: "break-statement";
};

type ContinueStatement = {
  type: "continue-statement";
};

type WithStatement = {
  type: "with-statement";
  context: Expression;
  alias?: string;
  body: Statement[];
};

type TryStatement = {
  type: "try-statement";
  body: Statement[];
  handlers: ExceptHandler[];
  finalizer?: Statement[];
};

type ExceptHandler = {
  type: "except-handler";
  errorType?: Expression;
  name?: string;
  body: Statement[];
};

type RaiseStatement = {
  type: "raise-statement";
  error?: Expression;
};

/* Helper functions */
// Helper to detect indentation level
function countIndentation(input: string): number {
  let spaces = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === " ") {
      spaces++;
    } else if (input[i] === "\t") {
      spaces += 4; // Common convention: 1 tab = 4 spaces
    } else {
      break;
    }
  }
  return spaces;
}

/* Parsers */

// Whitespace parsers
export const indentation = (level: number): Parser<string> => {
  return (input: string) => {
    const currentIndentation = countIndentation(input);
    if (currentIndentation === level) {
      return success(input.substring(0, level), input.substring(level));
    }
    return failure(
      `Expected indentation level ${level}, got ${currentIndentation}`,
      input
    );
  };
};

export const newline: Parser<string> = or(str("\n"), str("\r\n"));

// Comment parser
export const commentParser: Parser<string> = seq(
  [char("#"), manyTillOneOf(["\n", "\r\n"])],
  (r) => r.join("")
);

// Identifier parser
export const identifierParser: Parser<Identifier> = seqC(
  set("type", "identifier"),
  capture(
    seq(
      [
        or(char("_"), regexParser("[a-zA-Z]")),
        many(or(char("_"), regexParser("[a-zA-Z0-9]"))),
      ],
      (r) => r[0] + r[1].join("")
    ),
    "name"
  )
);

// Number literal parser
export const numberLiteralParser: Parser<NumberLiteral> = seqC(
  set("type", "number-literal"),
  capture(
    seq(
      [
        optional(char("-")),
        or(
          seq(
            [
              char("0"),
              optional(
                seq(
                  [oneOf("xXbBoO"), many1(regexParser("[0-9a-fA-F]"))],
                  (r) => r[0] + r[1].join("")
                )
              ),
            ],
            (r) => "0" + (r[1] || "")
          ),
          seq(
            [
              regexParser("[1-9]"),
              many(digit),
              optional(
                seq([char("."), many1(digit)], (r) => "." + r[1].join(""))
              ),
              optional(
                seq(
                  [oneOf("eE"), optional(oneOf("+-")), many1(digit)],
                  (r) => r[0] + (r[1] || "") + r[2].join("")
                )
              ),
            ],
            (r) => r[0] + r[1].join("") + (r[2] || "") + (r[3] || "")
          )
        ),
      ],
      (r) => (r[0] || "") + r[1]
    ),
    "value"
  )
);

// String literal parser
export const stringLiteralParser: Parser<StringLiteral> = seqC(
  set("type", "string-literal"),
  capture(
    or(
      seq([char("'"), manyTillStr("'"), char("'")], (r) => r[1]),
      seq([char('"'), manyTillStr('"'), char('"')], (r) => r[1]),
      seq([str("'''"), manyTillStr("'''"), str("'''")], (r) => r[1]),
      seq([str('"""'), manyTillStr('"""'), str('"""')], (r) => r[1])
    ),
    "value"
  )
);

// Boolean literal parser
export const booleanLiteralParser: Parser<BooleanLiteral> = seqC(
  set("type", "boolean-literal"),
  capture(
    or(
      map(str("True"), () => true),
      map(str("False"), () => false)
    ),
    "value"
  )
);

// None literal parser
export const noneLiteralParser: Parser<NoneLiteral> = seqC(
  set("type", "none-literal"),
  set("value", null),
  str("None")
);

// Literal parser (combines all literal types)
export const literalParser: Parser<Literal> = or(
  numberLiteralParser,
  stringLiteralParser,
  booleanLiteralParser,
  noneLiteralParser
);

// List expression parser
export const listExpressionParser: Parser<ListExpression> = seqC(
  set("type", "list-expression"),
  char("["),
  optional(spaces),
  capture(
    sepBy(
      seq([optional(spaces), char(","), optional(spaces)], () => ","),
      expressionParser
    ),
    "elements"
  ),
  optional(spaces),
  optional(char(",")),
  optional(spaces),
  char("]")
);

// Dict expression parser
export const dictExpressionParser: Parser<DictExpression> = seqC(
  set("type", "dict-expression"),
  char("{"),
  optional(spaces),
  capture(
    sepBy(
      seq([optional(spaces), char(","), optional(spaces)], () => ","),
      seq(
        [
          expressionParser,
          optional(spaces),
          char(":"),
          optional(spaces),
          expressionParser,
        ],
        (r) => ({ key: r[0], value: r[4] })
      )
    ),
    "entries"
  ),
  optional(spaces),
  optional(char(",")),
  optional(spaces),
  char("}")
);

// Tuple expression parser
export const tupleExpressionParser: Parser<TupleExpression> = seqC(
  set("type", "tuple-expression"),
  char("("),
  optional(spaces),
  capture(
    sepBy(
      seq([optional(spaces), char(","), optional(spaces)], () => ","),
      expressionParser
    ),
    "elements"
  ),
  optional(spaces),
  optional(char(",")),
  optional(spaces),
  char(")")
);

// Attribute expression parser (object.attribute)
export const attributeExpressionParser: Parser<AttributeExpression> = seqC(
  set("type", "attribute-expression"),
  capture(
    or(
      identifierParser,
      /* callExpressionParser, */
      tupleExpressionParser,
      listExpressionParser,
      dictExpressionParser
    ),
    "object"
  ),
  char("."),
  capture(
    seq(
      [regexParser("[a-zA-Z_]"), many(regexParser("[a-zA-Z0-9_]"))],
      (r) => r[0] + r[1].join("")
    ),
    "attribute"
  )
);

// Call expression parser
export const callExpressionParser: Parser<CallExpression> = seqC(
  set("type", "call-expression"),
  capture(or(identifierParser, attributeExpressionParser), "callee"),
  char("("),
  optional(spaces),
  capture(
    sepBy(
      seq([optional(spaces), char(","), optional(spaces)], () => ","),
      expressionParser
    ),
    "arguments"
  ),
  optional(spaces),
  optional(char(",")),
  optional(spaces),
  char(")")
);

// Subscript expression parser
export const subscriptExpressionParser: Parser<SubscriptExpression> = seqC(
  set("type", "subscript-expression"),
  capture(
    or(
      identifierParser,
      attributeExpressionParser,
      callExpressionParser,
      tupleExpressionParser,
      listExpressionParser,
      dictExpressionParser
    ),
    "object"
  ),
  char("["),
  optional(spaces),
  capture(expressionParser, "index"),
  optional(spaces),
  char("]")
);

// Binary expression parser (a + b, a - b, etc.)
export const binaryExpressionParser: Parser<BinaryExpression> = seqC(
  set("type", "binary-expression"),
  capture(
    or(
      literalParser,
      identifierParser,
      attributeExpressionParser,
      callExpressionParser,
      tupleExpressionParser,
      listExpressionParser,
      dictExpressionParser,
      subscriptExpressionParser
    ),
    "left"
  ),
  optional(spaces),
  capture(oneOf("+-*/=<>!&|%^"), "operator"),
  optional(spaces),
  capture(expressionParser, "right")
);

// Expression parser (combines all expression types)
export function expressionParser(input: string): ParserResult<Expression> {
  return or(
    binaryExpressionParser,
    callExpressionParser,
    subscriptExpressionParser,
    attributeExpressionParser,
    listExpressionParser,
    dictExpressionParser,
    tupleExpressionParser,
    literalParser,
    identifierParser
  )(input);
}

// Assignment statement parser
export const assignmentStatementParser: Parser<AssignmentStatement> = seqC(
  set("type", "assignment-statement"),
  capture(
    or(identifierParser, attributeExpressionParser, subscriptExpressionParser),
    "target"
  ),
  optional(spaces),
  char("="),
  optional(spaces),
  capture(expressionParser, "value")
);

// Pass statement parser
export const passStatementParser: Parser<PassStatement> = seqC(
  set("type", "pass-statement"),
  str("pass")
);

// Break statement parser
export const breakStatementParser: Parser<BreakStatement> = seqC(
  set("type", "break-statement"),
  str("break")
);

// Continue statement parser
export const continueStatementParser: Parser<ContinueStatement> = seqC(
  set("type", "continue-statement"),
  str("continue")
);

// Return statement parser
export const returnStatementParser: Parser<ReturnStatement> = seqC(
  set("type", "return-statement"),
  str("return"),
  capture(optional(seq([spaces, expressionParser], (r) => r[1])), "value")
);

// Import statement parser
export const importStatementParser: Parser<ImportStatement> = seqC(
  set("type", "import-statement"),
  str("import"),
  spaces,
  capture(
    seq(
      [regexParser("[a-zA-Z_]"), many(regexParser("[a-zA-Z0-9_\\.]"))],
      (r) => r[0] + r[1].join("")
    ),
    "module"
  ),
  capture(
    optional(
      seq([spaces, str("as"), spaces, identifierParser], (r) => r[3].name)
    ),
    "alias"
  )
);

// Block statement parser (for if, while, for, etc.)
export function blockStatementParser(indentLevel: number): Parser<Statement[]> {
  return (input: string) => {
    // Empty block check
    if (input.trimStart().startsWith("pass")) {
      const passResult = passStatementParser(input.trimStart());
      if (passResult.success) {
        return success([passResult.result], passResult.rest);
      }
    }

    const statements: Statement[] = [];
    let rest = input;

    while (rest.length > 0) {
      // Check if still in the block (same indentation level)
      const currentIndent = countIndentation(rest);
      if (currentIndent !== indentLevel) {
        break;
      }

      const result = statementParser(indentLevel)(rest.trimStart());
      if (!result.success) {
        return result;
      }

      statements.push(result.result);
      rest = result.rest;

      // Skip any newlines and comments
      while (rest.startsWith("\n") || rest.startsWith("\r\n")) {
        if (rest.startsWith("\r\n")) {
          rest = rest.substring(2);
        } else {
          rest = rest.substring(1);
        }
      }

      if (rest.trimStart().startsWith("#")) {
        const commentResult = commentParser(rest.trimStart());
        if (commentResult.success) {
          rest = commentResult.rest;
        }
      }
    }

    return success(statements, rest);
  };
}

// If statement parser
export function ifStatementParser(indentLevel: number): Parser<IfStatement> {
  return seqC(
    set("type", "if-statement"),
    str("if"),
    spaces,
    capture(expressionParser, "test"),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "consequent"),
    capture(
      optional(
        seq(
          [
            indentation(indentLevel),
            str("else"),
            char(":"),
            optional(commentParser),
            optional(newline),
            blockStatementParser(indentLevel + 4),
          ],
          (r) => r[5]
        )
      ),
      "alternate"
    )
  );
}

// While statement parser
export function whileStatementParser(
  indentLevel: number
): Parser<WhileStatement> {
  return seqC(
    set("type", "while-statement"),
    str("while"),
    spaces,
    capture(expressionParser, "test"),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body")
  );
}

// For statement parser
export function forStatementParser(indentLevel: number): Parser<ForStatement> {
  return seqC(
    set("type", "for-statement"),
    str("for"),
    spaces,
    capture(or(identifierParser, tupleExpressionParser), "variable"),
    spaces,
    str("in"),
    spaces,
    capture(expressionParser, "iterable"),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body")
  );
}

// Function parameter parser
export const parameterParser: Parser<Parameter> = seq(
  [
    identifierParser,
    optional(
      seq(
        [optional(spaces), char("="), optional(spaces), expressionParser],
        (r) => r[3]
      )
    ),
  ],
  (r) => ({
    name: r[0].name,
    defaultValue: r[1] || undefined,
  })
);

// Function declaration parser
export function functionDeclarationParser(
  indentLevel: number
): Parser<FunctionDeclaration> {
  return seqC(
    set("type", "function-declaration"),
    str("def"),
    spaces,
    capture(
      seq(
        [regexParser("[a-zA-Z_]"), many(regexParser("[a-zA-Z0-9_]"))],
        (r) => r[0] + r[1].join("")
      ),
      "name"
    ),
    char("("),
    optional(spaces),
    capture(
      sepBy(
        seq([optional(spaces), char(","), optional(spaces)], () => ","),
        parameterParser
      ),
      "parameters"
    ),
    optional(spaces),
    char(")"),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body")
  );
}

// Class declaration parser
export function classDeclarationParser(
  indentLevel: number
): Parser<ClassDeclaration> {
  return seqC(
    set("type", "class-declaration"),
    str("class"),
    spaces,
    capture(
      seq(
        [regexParser("[a-zA-Z_]"), many(regexParser("[a-zA-Z0-9_]"))],
        (r) => r[0] + r[1].join("")
      ),
      "name"
    ),
    capture(
      optional(
        seq(
          [
            char("("),
            optional(spaces),
            sepBy(
              seq([optional(spaces), char(","), optional(spaces)], () => ","),
              expressionParser
            ),
            optional(spaces),
            char(")"),
          ],
          (r) => r[2]
        )
      ),
      "bases"
    ),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body")
  );
}

// With statement parser
export function withStatementParser(
  indentLevel: number
): Parser<WithStatement> {
  return seqC(
    set("type", "with-statement"),
    str("with"),
    spaces,
    capture(expressionParser, "context"),
    capture(
      optional(
        seq([spaces, str("as"), spaces, identifierParser], (r) => r[3].name)
      ),
      "alias"
    ),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body")
  );
}

// Except handler parser
export function exceptHandlerParser(
  indentLevel: number
): Parser<ExceptHandler> {
  return seqC(
    set("type", "except-handler"),
    str("except"),
    capture(
      optional(seq([spaces, expressionParser], (r) => r[1])),
      "errorType"
    ),
    capture(
      optional(
        seq([spaces, str("as"), spaces, identifierParser], (r) => r[3].name)
      ),
      "name"
    ),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body")
  );
}

// Try statement parser
export function tryStatementParser(indentLevel: number): Parser<TryStatement> {
  return seqC(
    set("type", "try-statement"),
    str("try"),
    char(":"),
    optional(commentParser),
    optional(newline),
    capture(blockStatementParser(indentLevel + 4), "body"),
    capture(
      many(
        seq(
          [indentation(indentLevel), exceptHandlerParser(indentLevel)],
          (r) => r[1]
        )
      ),
      "handlers"
    ),
    capture(
      optional(
        seq(
          [
            indentation(indentLevel),
            str("finally"),
            char(":"),
            optional(commentParser),
            optional(newline),
            blockStatementParser(indentLevel + 4),
          ],
          (r) => r[5]
        )
      ),
      "finalizer"
    )
  );
}

// Raise statement parser
export const raiseStatementParser: Parser<RaiseStatement> = seqC(
  set("type", "raise-statement"),
  str("raise"),
  capture(optional(seq([spaces, expressionParser], (r) => r[1])), "error")
);

// Statement parser (combines all statement types)
export function statementParser(indentLevel: number): Parser<Statement> {
  return (input: string) => {
    // Handle commented lines
    if (input.trimStart().startsWith("#")) {
      const commentResult = commentParser(input.trimStart());
      if (commentResult.success) {
        // Skip comment line and parse next line
        if (
          commentResult.rest.startsWith("\n") ||
          commentResult.rest.startsWith("\r\n")
        ) {
          let rest = commentResult.rest;
          if (rest.startsWith("\r\n")) {
            rest = rest.substring(2);
          } else {
            rest = rest.substring(1);
          }
          return statementParser(indentLevel)(rest);
        }
      }
    }

    return or(
      ifStatementParser(indentLevel),
      forStatementParser(indentLevel),
      whileStatementParser(indentLevel),
      functionDeclarationParser(indentLevel),
      classDeclarationParser(indentLevel),
      withStatementParser(indentLevel),
      tryStatementParser(indentLevel),
      importStatementParser,
      assignmentStatementParser,
      returnStatementParser,
      passStatementParser,
      breakStatementParser,
      continueStatementParser,
      raiseStatementParser,
      map(expressionParser, (expr) => {
        return {
          type: "expression-statement",
          expression: expr,
        } as any;
      })
    )(input);
  };
}

// Python module parser (the entire file)
export const pythonParser: Parser<Statement[]> = (input: string) => {
  const statements: Statement[] = [];
  let rest = input.trimStart();

  while (rest.length > 0) {
    // Skip empty lines and comments
    if (rest.startsWith("\n") || rest.startsWith("\r\n")) {
      if (rest.startsWith("\r\n")) {
        rest = rest.substring(2).trimStart();
      } else {
        rest = rest.substring(1).trimStart();
      }
      continue;
    }

    if (rest.startsWith("#")) {
      const commentResult = commentParser(rest);
      if (commentResult.success) {
        rest = commentResult.rest.trimStart();
        continue;
      }
    }

    // Parse statement
    const result = statementParser(0)(rest);
    if (!result.success) {
      if (rest.trim() === "") {
        break; // End of file
      }
      return result;
    }

    statements.push(result.result);
    rest = result.rest.trimStart();
  }

  return success(statements, rest);
};
