#!/bin/sh

# input output w h

convert $1'[0]' -background transparent -gravity center -extent $3x$4 $2
