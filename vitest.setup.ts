export function success({
  rest,
  match,
  matches,
}: {
  rest: string;
  match: string;
  matches?: Record<string, string>;
}) {
  return { success: true, rest, match, matches };
}

export function failure({ rest, message }: { rest: string; message: string }) {
  return { success: false, rest, message };
}
