/** The character tables the parser and astToBash share. One table, so a
 * word the parser accepts unquoted is a word the renderer emits unquoted. */

export const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";

/** Characters allowed inside a bare word. Includes `=` because an
 * assignment-shaped ARGUMENT is an ordinary word: `env FOO=bar`. */
export const BARE_WORD_CHAR_STRING = LETTERS + DIGITS + "_-.=:+";

/** Characters a bare word may START with. No `-`: that is a flag. `~` is
 * allowed here and nowhere else, so `~/x` and `~user` parse and `a~b`
 * does not. */
export const BARE_WORD_START_CHAR_STRING = LETTERS + DIGITS + "_.=:+~";

/** Characters a glob word may contain beyond a path's. */
export const GLOB_WORD_CHARS = "*?[]";

/** The ones that make a word a glob. A lone `]` is ordinary text in bash:
 * `echo a]b` prints `a]b`. */
export const GLOB_TRIGGER_CHARS = "*?[";

const GLOB_BODY = new Set(BARE_WORD_CHAR_STRING + "/" + GLOB_WORD_CHARS);
const GLOB_TRIGGERS = new Set(GLOB_TRIGGER_CHARS);

/** True for text the glob word parser could have produced: path
 * characters and glob characters only, with at least one trigger. */
export function isGlobText(text: string): boolean {
  if (text.length === 0) return false;
  let triggered = false;
  for (const character of text) {
    if (!GLOB_BODY.has(character)) return false;
    if (GLOB_TRIGGERS.has(character)) triggered = true;
  }
  return triggered;
}
