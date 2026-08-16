#!/bin/bash

set -ex

cd ~/smogon/sprites

pnpm build

rm -rf deploy/smogon
node tools/deploy/index.ts run smogon.deploy.js -o deploy/smogon

rsync -a deploy/smogon/xyicons/ smogon:/smog2/sprites/xyicons
