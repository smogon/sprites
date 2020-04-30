#!/bin/sh

# Smogdex Facebook social images

convert $1'[0]' -trim -resize 150x150 -background white -gravity center -extent 198x198 -bordercolor black -border 1 $2
