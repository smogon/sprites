#!/bin/bash

set -ex

cd ~/smogon/sprites

rm -rf deploy/smogon
node tools/deploy/index.ts run smogon.build.ts -o deploy/smogon

rsync -a deploy/smogon/xyicons/ smogon:/smog2/sprites/xyicons
