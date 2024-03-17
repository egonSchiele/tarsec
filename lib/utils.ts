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
