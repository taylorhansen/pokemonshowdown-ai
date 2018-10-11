#!/usr/bin/env sh
# uses Pokemon-Showdown's dex data to build our own dex file

echo Building dex...
dex_file=src/data/dex.ts
ts-node scripts/build-dex.ts > $dex_file

# try to fix any style errors
# this will also point out errors that must be fixed manually
tslint --fix $dex_file

# tslint will make this script return an error code so override that
exit 0
