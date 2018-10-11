#!/usr/bin/env sh
# clones the Pokemon-Showdown github repository

ps_dir=scripts/Pokemon-Showdown
if [ -d $ps_dir ]
then
    cd $ps_dir
    git checkout master
    git pull origin master
else
    git clone https://github.com/Zarel/Pokemon-Showdown $ps_dir
fi
