import { makeLexemes } from "../../lexeme.js";

/** Bash lexeme set. Newlines are NOT whitespace (they separate commands and
 * trigger heredoc draining). `#` comments run to end of line; `\`-newline is
 * a line continuation. */
export const lx = makeLexemes({
  whitespace: " \t",
  lineComment: "#",
  lineContinuation: true,
});
