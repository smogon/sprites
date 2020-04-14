#!/bin/sh

# input output w h

set -e

gm convert $1'[0]' -background transparent -gravity center -extent $3x$4 $2
advpng -q -z $2
