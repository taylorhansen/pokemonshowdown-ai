#!/usr/bin/env sh
# clones the Pokemon-Showdown github repository

ps_dir=./scripts/Pokemon-Showdown
if [ -d $ps_dir ]
then
    cd $ps_dir
    git checkout master
    git fetch origin master
    git reset --hard origin/master
else
    git clone https://github.com/Zarel/Pokemon-Showdown $ps_dir
    cd $ps_dir
fi

echo "Installing default config"
cp config/config-example.js config/config.js

echo "Compiling"
npm i
npm run build
