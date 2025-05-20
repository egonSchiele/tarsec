import { assert, describe, expect, it } from "vitest";
import {
  pythonParser,
  identifierParser,
  numberLiteralParser,
  stringLiteralParser,
  booleanLiteralParser,
  noneLiteralParser,
  listExpressionParser,
  dictExpressionParser,
  tupleExpressionParser,
  callExpressionParser,
  assignmentStatementParser,
  ifStatementParser,
  functionDeclarationParser,
} from "./python";
import { success } from "@/lib/types";

describe("Python Parser - Basic Elements", () => {
  it("should parse identifiers", () => {
    const input = "variable_name";
    const expected = {
      type: "identifier",
      name: "variable_name",
    };
    expect(identifierParser(input)).toEqual(success(expected, ""));
  });

  it("should parse number literals", () => {
    const inputs = ["123", "3.14", "-42", "0xFF", "1e6"];
    
    inputs.forEach(input => {
      const result = numberLiteralParser(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.type).toBe("number-literal");
        expect(result.result.value).toBe(input);
      }
    });
  });

  it("should parse string literals", () => {
    const inputs = [
      "'single quotes'",
      '"double quotes"',
      "'''triple single quotes'''",
      '"""triple double quotes"""'
    ];
    
    inputs.forEach(input => {
      const result = stringLiteralParser(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.type).toBe("string-literal");
      }
    });
  });

  it("should parse boolean literals", () => {
    expect(booleanLiteralParser("True")).toEqual(success({
      type: "boolean-literal",
      value: true,
    }, ""));
    
    expect(booleanLiteralParser("False")).toEqual(success({
      type: "boolean-literal",
      value: false,
    }, ""));
  });

  it("should parse None literal", () => {
    expect(noneLiteralParser("None")).toEqual(success({
      type: "none-literal",
      value: null,
    }, ""));
  });
});

describe("Python Parser - Expressions", () => {
  it("should parse list expressions", () => {
    const input = "[1, 'two', True]";
    const result = listExpressionParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("list-expression");
      expect(result.result.elements.length).toBe(3);
      expect(result.result.elements[0].type).toBe("number-literal");
      expect(result.result.elements[1].type).toBe("string-literal");
      expect(result.result.elements[2].type).toBe("boolean-literal");
    }
  });

  it("should parse dictionary expressions", () => {
    const input = "{'a': 1, 'b': 2}";
    const result = dictExpressionParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("dict-expression");
      expect(result.result.entries.length).toBe(2);
      expect(result.result.entries[0].key.type).toBe("string-literal");
      expect(result.result.entries[0].value.type).toBe("number-literal");
    }
  });

  it("should parse tuple expressions", () => {
    const input = "(1, 'two', True)";
    const result = tupleExpressionParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("tuple-expression");
      expect(result.result.elements.length).toBe(3);
    }
  });

  it("should parse function calls", () => {
    const input = "print('Hello, world!')";
    const result = callExpressionParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("call-expression");
      expect(result.result.callee.type).toBe("identifier");
      expect(result.result.callee.name).toBe("print");
      expect(result.result.arguments.length).toBe(1);
      expect(result.result.arguments[0].type).toBe("string-literal");
    }
  });
});

describe("Python Parser - Statements", () => {
  it("should parse assignment statements", () => {
    const input = "x = 42";
    const result = assignmentStatementParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("assignment-statement");
      expect(result.result.target.type).toBe("identifier");
      expect(result.result.target.name).toBe("x");
      expect(result.result.value.type).toBe("number-literal");
      expect(result.result.value.value).toBe("42");
    }
  });

  it("should parse if statements", () => {
    const input = "if x > 0:\n    print('Positive')\n";
    const result = ifStatementParser(0)(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("if-statement");
      expect(result.result.test.type).toBe("binary-expression");
      expect(result.result.consequent.length).toBe(1);
    }
  });

  it("should parse function declarations", () => {
    const input = "def greet(name, greeting='Hello'):\n    return greeting + ', ' + name\n";
    const result = functionDeclarationParser(0)(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.type).toBe("function-declaration");
      expect(result.result.name).toBe("greet");
      expect(result.result.parameters.length).toBe(2);
      expect(result.result.parameters[0].name).toBe("name");
      expect(result.result.parameters[1].name).toBe("greeting");
      expect(result.result.parameters[1].defaultValue).toBeDefined();
      expect(result.result.body.length).toBe(1);
      expect(result.result.body[0].type).toBe("return-statement");
    }
  });
});

describe("Python Parser - Complete Programs", () => {
  it("should parse a simple program", () => {
    const input = `
# A simple Python program
x = 10
y = 20
result = x + y
print(result)
`;
    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBe(4);
      expect(result.result[0].type).toBe("assignment-statement");
      expect(result.result[1].type).toBe("assignment-statement");
      expect(result.result[2].type).toBe("assignment-statement");
      expect(result.result[3].type).toBe("expression-statement");
    }
  });

  it("should parse a function definition and call", () => {
    const input = `
def add(a, b):
    return a + b

result = add(5, 7)
print("The result is:", result)
`;
    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBe(3);
      expect(result.result[0].type).toBe("function-declaration");
      expect(result.result[1].type).toBe("assignment-statement");
      expect(result.result[2].type).toBe("expression-statement");
    }
  });

  it("should parse a class definition", () => {
    const input = `
class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    def greet(self):
        return "Hello, my name is " + self.name

person = Person("Alice", 30)
greeting = person.greet()
print(greeting)
`;
    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBe(4);
      expect(result.result[0].type).toBe("class-declaration");
      expect(result.result[0].name).toBe("Person");
      expect(result.result[0].body.length).toBe(2);
      expect(result.result[0].body[0].type).toBe("function-declaration");
      expect(result.result[0].body[1].type).toBe("function-declaration");
    }
  });

  it("should parse control flow statements", () => {
    const input = `
def check_number(n):
    if n > 0:
        return "Positive"
    elif n < 0:
        return "Negative"
    else:
        return "Zero"

numbers = [5, -3, 0, 10, -7]
for num in numbers:
    result = check_number(num)
    print(num, "is", result)

count = 0
while count < 5:
    print(count)
    count = count + 1
`;
    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBe(5);
      expect(result.result[0].type).toBe("function-declaration");
      expect(result.result[1].type).toBe("assignment-statement");
      expect(result.result[2].type).toBe("for-statement");
      expect(result.result[3].type).toBe("assignment-statement");
      expect(result.result[4].type).toBe("while-statement");
    }
  });

  it("should parse error handling", () => {
    const input = `
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print("Error:", e)
finally:
    print("This will always execute")
`;
    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.length).toBe(1);
      expect(result.result[0].type).toBe("try-statement");
      expect(result.result[0].body.length).toBe(1);
      expect(result.result[0].handlers.length).toBe(1);
      expect(result.result[0].finalizer.length).toBe(1);
    }
  });
});