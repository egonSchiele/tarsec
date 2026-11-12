/** The character tables the parser and astToBash share. One table, so a
 * word the parser accepts unquoted is a word the renderer emits unquoted. */

export const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";

/** Characters that are ordinary text to bash wherever they sit in a word:
 * `--json title,body`, `--assignee @me`, `date +%Y`. */
const PLAIN_PUNCTUATION = ",@%";

/** Characters allowed inside a bare word. Includes `=` because an
 * assignment-shaped ARGUMENT is an ordinary word: `env FOO=bar`. */
export const BARE_WORD_CHAR_STRING = LETTERS + DIGITS + "_-.=:+" + PLAIN_PUNCTUATION;

/** Characters a bare word may START with. No `-`: that is a flag. `~`
 * starts a word here (`~/x`, `~user`); inside a word it is one of
 * `INNER_WORD_CHAR_STRING`. */
export const BARE_WORD_START_CHAR_STRING = LETTERS + DIGITS + "_.=:+~" + PLAIN_PUNCTUATION;

/** Characters allowed in a flag name or a flag value. No `=`: it splits
 * `--format=oneline` into a name and a value. The plain punctuation is
 * here so `cut -d, -f1` and `sort -k2,2n` are flags like any other. */
export const FLAG_CHAR_STRING = LETTERS + DIGITS + "_-./" + PLAIN_PUNCTUATION;

/** Characters a literal or path word may hold after its first character,
 * beyond the bare word set. Bash expands `~` only at the start of a word
 * and reads `^` as text outside interactive history, so `HEAD~1` and
 * `HEAD^` are plain words. Not in the bare word set itself: a word built
 * from parts (`$X~/y`, `'a'~`) and a glob still refuse them. */
export const INNER_WORD_CHAR_STRING = "~^";

/** True when a `~` follows `=` or `:`. Bash expands that tilde in an
 * assignment-shaped word (`PATH=~/bin:~/tools`), so the word is not the
 * text it shows. */
export function hasAssignmentTilde(text: string): boolean {
  return text.includes("=~") || text.includes(":~");
}

/** The flag that ends the flags: `git checkout -- file`. */
export const END_OF_FLAGS = "--";

/** Characters a glob word may contain beyond a path's. */
export const GLOB_WORD_CHARS = "*?[]";

/** The ones that make a word a glob. A lone `]` is ordinary text in bash:
 * `echo a]b` prints `a]b`. */
export const GLOB_TRIGGER_CHARS = "*?[";

const GLOB_START = new Set(BARE_WORD_START_CHAR_STRING + "/" + GLOB_WORD_CHARS);
const GLOB_BODY = new Set(BARE_WORD_CHAR_STRING + "/" + GLOB_WORD_CHARS);
const GLOB_TRIGGERS = new Set(GLOB_TRIGGER_CHARS);

/** True for text the glob word parser could have produced: a first
 * character from the start set (so `~/*.md` is a glob and `-*` is not),
 * the rest path or glob characters, and at least one trigger. */
export function isGlobText(text: string): boolean {
  if (text.length === 0) return false;
  if (!GLOB_START.has(text[0])) return false;
  let triggered = GLOB_TRIGGERS.has(text[0]);
  for (const character of text.slice(1)) {
    if (!GLOB_BODY.has(character)) return false;
    if (GLOB_TRIGGERS.has(character)) triggered = true;
  }
  return triggered;
}

const GLOB_CHARS = new Set(GLOB_WORD_CHARS);

/** True when any glob character, trigger or not, appears in the text. */
export function hasGlobChar(text: string): boolean {
  for (const character of text) {
    if (GLOB_CHARS.has(character)) return true;
  }
  return false;
}
