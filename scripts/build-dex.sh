#!/usr/bin/env sh
# uses Pokemon-Showdown's dex data to build our own dex file

scripts_dir=$(dirname $0)
cd $scripts_dir
cd ..

dex_file=src/psbot/handlers/battle/formats/gen4/dex/dex.ts
npx ts-node $scripts_dir/build-dex.ts > $dex_file

# try to fix any style errors
npx eslint --fix $dex_file
