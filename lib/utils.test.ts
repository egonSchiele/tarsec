import { describe, expect, test } from "vitest";
import {
  merge,
  mergeCaptures,
  findAncestorWithNextParser,
  popMany,
  escape,
} from "./utils";
import { Node } from "./types";
import { char } from "./parsers";
describe("escape", () => {
  test("escape should return a JSON string of the input", () => {
    const input = {
      name: "John",
      age: 30,
    };
    const expected = JSON.stringify(input);
    const result = escape(input);
    expect(result).toEqual(expected);
  });
});

describe("merge", () => {
  test("merge should merge two arrays", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5, 6];
    const expected = [1, 2, 3, 4, 5, 6];
    const result = merge(arr1, arr2);
    expect(result).toEqual(expected);
  });

  test("merge should merge an array and a value", () => {
    const arr = [1, 2, 3];
    const value = 4;
    const expected = [1, 2, 3, 4];
    const result = merge(arr, value);
    expect(result).toEqual(expected);
  });

  test("merge should merge a value and an array", () => {
    const value = 1;
    const arr = [2, 3, 4];
    const expected = [1, 2, 3, 4];
    const result = merge(value, arr);
    expect(result).toEqual(expected);
  });

  test("merge should merge two values", () => {
    const value1 = 1;
    const value2 = 2;
    const expected = [1, 2];
    const result = merge(value1, value2);
    expect(result).toEqual(expected);
  });
});

describe("mergeCaptures", () => {
  test("mergeCaptures should merge two capture objects", () => {
    const capture1 = { name: "John", age: 30 };
    const capture2 = { city: "New York", age: 40 };
    const expected = { name: "John", age: [30, 40], city: "New York" };
    const result = mergeCaptures(capture1, capture2);
    expect(result).toEqual(expected);
  });
});

describe("findAncestorWithNextParser", () => {
  test("findAncestorWithNextParser should return the first ancestor node that is not closed", () => {
    const parent: Node = {
      closed: true,
      parent: {
        closed: false,
        parent: {
          closed: false,
          parent: null,
          parser: null,
          child: null,
        },
        parser: char("a"),
        child: null,
      },
      parser: null,
      child: null,
    };

    const node: Node = {
      closed: true,
      parent,
      parser: null,
      child: null,
    };

    const expected: [Node, number] = [parent.parent, 2];
    const result = findAncestorWithNextParser(node);
    expect(result).toEqual(expected);
  });
});

describe("popMany", () => {
  test("popMany should remove the specified number of elements from the array", () => {
    const arr = [1, 2, 3, 4, 5];
    const count = 3;
    const expected = [1, 2];
    popMany(arr, count);
    expect(arr).toEqual(expected);
  });
});
