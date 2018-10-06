#!/usr/bin/env sh
# clones the Pokemon-Showdown github repository in order to extract the desired
#  pokedex/movedex/item info from it

ps_dir=./js/Pokemon-Showdown
if [ -d $ps_dir ]
then
    cd $ps_dir
    git checkout master
    git pull origin master
    cd ../..
else
    git clone https://github.com/Zarel/Pokemon-Showdown $ps_dir
fi

echo Building dex...
dex_file=./src/data/dex.ts

node ./js/build-dex.js > $dex_file
# try to fix any style errors
# this will also point out errors that must be fixed manually
tslint --fix $dex_file
