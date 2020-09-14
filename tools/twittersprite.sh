#!/bin/sh

# Smogdex Twitter social images

magick convert $1'[0]' -trim -resize 115x115 -background white -gravity center -extent 120x120 $2
