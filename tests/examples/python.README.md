# Python Parser using Tarsec

This is an implementation of a Python language parser using the Tarsec parser combinator library. The parser is capable of parsing Python syntax and generating an Abstract Syntax Tree (AST) that represents the Python code.

## Features

The Python parser supports:

- **Basic Elements**: Identifiers, literals (numbers, strings, booleans, None)
- **Expressions**: Lists, dictionaries, tuples, function calls, attribute access, subscript access, binary operations
- **Statements**: Assignment, if/elif/else, loops (for, while), function declarations, class declarations
- **Control Flow**: Return, pass, break, continue statements
- **Error Handling**: Try/except/finally blocks, raise statements
- **Imports**: Basic import statements
- **Indentation**: Proper handling of Python's significant whitespace

## Usage

```typescript
import { pythonParser } from "./python";

// Parse a Python program
const input = `
def greet(name):
    return "Hello, " + name

print(greet("World"))
`;

const result = pythonParser(input);

if (result.success) {
    console.log(JSON.stringify(result.result, null, 2));
}
```

## Parser Structure

The parser is organized into several components:

1. **Type Definitions**: Defines TypeScript types for Python AST nodes
2. **Helper Functions**: Utilities for handling indentation and other parsing tasks
3. **Basic Parsers**: Parse fundamental Python elements like identifiers and literals
4. **Expression Parsers**: Parse Python expressions
5. **Statement Parsers**: Parse Python statements
6. **Block Parsers**: Handle indentation-based code blocks
7. **Module Parser**: `pythonParser` is the main entry point for parsing complete Python files

## Example AST Output

For the following Python code:

```python
def add(a, b):
    return a + b

result = add(5, 7)
print("The result is:", result)
```

The parser produces this AST:

```json
[
  {
    "type": "function-declaration",
    "name": "add",
    "parameters": [
      {
        "name": "a"
      },
      {
        "name": "b"
      }
    ],
    "body": [
      {
        "type": "return-statement",
        "value": {
          "type": "binary-expression",
          "operator": "+",
          "left": {
            "type": "identifier",
            "name": "a"
          },
          "right": {
            "type": "identifier",
            "name": "b"
          }
        }
      }
    ]
  },
  {
    "type": "assignment-statement",
    "target": {
      "type": "identifier",
      "name": "result"
    },
    "value": {
      "type": "call-expression",
      "callee": {
        "type": "identifier",
        "name": "add"
      },
      "arguments": [
        {
          "type": "number-literal",
          "value": "5"
        },
        {
          "type": "number-literal",
          "value": "7"
        }
      ]
    }
  },
  {
    "type": "expression-statement",
    "expression": {
      "type": "call-expression",
      "callee": {
        "type": "identifier",
        "name": "print"
      },
      "arguments": [
        {
          "type": "string-literal",
          "value": "The result is:"
        },
        {
          "type": "identifier",
          "name": "result"
        }
      ]
    }
  }
]
```

## Limitations

This Python parser covers most common Python syntax but has some limitations:

1. Does not support Python-specific features like decorators, comprehensions, async/await
2. Limited support for complex import statements (e.g., `from x import y as z`)
3. Does not handle some advanced language features (type annotations, walrus operator, etc.)
4. Error reporting is basic

## Testing

The parser comes with test files that verify its functionality:

- `python.test.ts`: Basic tests for individual parser components
- `python-complex.test.ts`: Tests for more complex, real-world Python code examples

Run the tests using:

```
npm test
```