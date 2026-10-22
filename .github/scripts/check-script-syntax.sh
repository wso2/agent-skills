#!/usr/bin/env bash

# Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# Syntax-checks every bundled script under plugins/ without executing it.
# Node files are parsed with `node --check`, shell files with `bash -n`.
# Run from the repo root:
#   .github/scripts/check-script-syntax.sh
# Exits 1 if any file has a syntax error, 0 otherwise.

set -u
fail=0

while IFS= read -r f; do
  echo "node --check $f"
  node --check "$f" || fail=1
done < <(find plugins -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \))

while IFS= read -r f; do
  echo "bash -n $f"
  bash -n "$f" || fail=1
done < <(find plugins -type f -name '*.sh')

exit "$fail"
