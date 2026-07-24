#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

case `uname` in
    *CYGWIN*) basedir=`cygpath -w "$basedir"`;;
esac

if [ -z "$NODE_PATH" ]; then
  export NODE_PATH="/usr/local/lib/node_modules/acorn/bin/node_modules:/usr/local/lib/node_modules/acorn/node_modules:/usr/local/lib/node_modules:/usr/local/lib/node_modules:/usr/lib/node_modules:/node_modules:/usr/local/lib/node_modules/.pnpm/node_modules"
else
  export NODE_PATH="/usr/local/lib/node_modules/acorn/bin/node_modules:/usr/local/lib/node_modules/acorn/node_modules:/usr/local/lib/node_modules:/usr/local/lib/node_modules:/usr/lib/node_modules:/node_modules:/usr/local/lib/node_modules/.pnpm/node_modules:$NODE_PATH"
fi
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/../acorn/bin/acorn" "$@"
else
  exec node  "$basedir/../acorn/bin/acorn" "$@"
fi
