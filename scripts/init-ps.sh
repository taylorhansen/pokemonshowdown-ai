#!/usr/bin/env sh
# initializes and compiles the pokemon-showdown submodule

cd $(dirname $0)
cd ..

ps_dir=./pokemon-showdown/

git submodule update --init --recursive
if [ ! -d $ps_dir ]
then
    echo "Submodule not detected!"
    exit 1
fi
cd $ps_dir

# TODO: if this gets too complicated, manage changes using a fork instead
# for now, these changes are currently gitignored
echo "Installing default config"
cp config/config-example.js config/config.js

echo "Compiling"
npm install
npm run build
