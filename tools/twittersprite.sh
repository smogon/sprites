#!/bin/sh

# Smogdex Twitter social images

set -e

gm convert $1'[0]' -trim -resize 115x115 -background white -gravity center -extent 120x120 $2
advpng -z $2
