import { test, expect } from "vitest";
import { resultToString, trace } from "./trace";
import { failure, success } from "./types";

test("resultToString should return a string with a success message", () => {
  const name = "Test";
  const result = success("abc", "def");
  const expectedResult = `✅ Test -- match: "abc", rest: "def"`;

  const actualResult = resultToString(name, result);

  expect(actualResult).toBe(expectedResult);
});

test("resultToString should return a string with a failure message", () => {
  const name = "Test";
  const result = failure("Invalid input", "def");
  const expectedResult = `❌ Test -- message: "Invalid input", rest: "def"`;

  const actualResult = resultToString(name, result);

  expect(actualResult).toBe(expectedResult);
});

/* test("trace should log the input and result when DEBUG mode is enabled", () => {
  const name = "Test";
  const parser = jest.fn();
  const input = "abc";
  const result = { success: true, result: "abc", rest: "def", captures: {} };
  process.env.DEBUG = "true";
  jest.spyOn(console, "log");

  const tracedParser = trace(name, parser);
  tracedParser(input);

  expect(console.log).toHaveBeenCalledWith("🔍 Test -- input: abc");
  expect(console.log).toHaveBeenCalledWith("✅ Test -- match: abc, rest: def");
  expect(console.log).toHaveBeenCalledWith("⭐ Test -- captures: {}");
});
 */
