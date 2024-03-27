import { Node } from "./types";

export function escape(str: any) {
  return JSON.stringify(str);
}

export function merge(a: any | any[], b: any | any[]): any[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  } else if (Array.isArray(a)) {
    return [...a, b];
  } else if (Array.isArray(b)) {
    return [a, ...b];
  } else {
    return [a, b];
  }
}

export function mergeCaptures(
  a: Record<string, any>,
  b: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};
  Object.keys(a).forEach((key) => {
    result[key] = a[key];
  });
  Object.keys(b).forEach((key) => {
    if (result[key]) {
      result[key] = merge(result[key], b[key]);
    } else {
      result[key] = b[key];
    }
  });
  return result;
}

export function findAncestorWithNextParser(
  node: Node,
  count = 0
): [Node, number] {
  if (node === null) return [null, count];
  if (!node.closed) {
    return [node, count];
  }
  if (node.parent) {
    return findAncestorWithNextParser(node.parent, count + 1);
  }
  return [null, count];
}

export function popMany(arr: any[], count: number) {
  for (let i = 0; i < count; i++) {
    arr.pop();
  }
}

export function round(num: number, places = 2) {
  return Math.round(num * 10 ** places) / 10 ** places;
}
