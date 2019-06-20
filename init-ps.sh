#!/usr/bin/env sh
# clones the Pokemon-Showdown github repository

ps_dir=./Pokemon-Showdown/
if [ ! -d $ps_dir ]
then
    echo "Submodule not detected!"
    echo "Updating"
    git submodule init Pokemon-Showdown
    git submodule update
fi
cd $ps_dir

# TODO: if this gets too complicated, manage changes using a fork instead
# for now, these changes are currently gitignored
echo "Installing default config"
cp config/config-example.js config/config.js

echo "Compiling"
npm i
npm run build
