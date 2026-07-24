/** Shared fixtures for the bash parser test suites. Keeping the corpus in
 * one place means the equivalence guarantees between the parser variants
 * can't silently drift apart. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Real-world scripts checked into the repo (originally from lunr@2.3.9
 * (MIT) and an npm .bin wrapper, with machine-specific paths
 * genericized). Read eagerly: a missing fixture is a test failure, not a
 * silent skip. */
export const REAL_SCRIPTS: [string, string][] = [
  "lunr-release.sh",
  "npm-bin-wrapper.sh",
].map((name) => [
  name,
  fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"),
]);

/** A realistic deploy-style script exercising most of the supported
 * subset: functions, case, loops, redirects, substitutions, background. */
export const BIG_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

readonly LOG_FILE=/var/log/deploy.log

log() {
  echo "[$(date +%H:%M:%S)] $1" >> "$LOG_FILE"
}

check_deps() {
  for cmd in git node npm; do
    if ! command -v "$cmd" > /dev/null 2>&1; then
      log "missing dependency: $cmd"
      exit 1
    fi
  done
}

main() {
  check_deps
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)

  case "$branch" in
    main|master)
      log "deploying $branch"
      npm run build && npm run deploy || exit 1
      ;;
    feature/*)
      log "skipping feature branch"
      ;;
    *)
      echo "unknown branch: $branch" >&2
      exit 1
      ;;
  esac

  while read -r line; do
    echo "-> $line"
  done < "$LOG_FILE" &
}

main "$@"
`;
