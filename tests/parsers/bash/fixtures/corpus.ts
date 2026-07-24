/** Shared fixtures for the bash parser test suites. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Read a checked-in fixture script. A missing fixture is a test
 * failure, not a silent skip. */
export function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

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
