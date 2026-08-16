#!/bin/bash

set -ex

cd /home/monsanto/smogon/sprites
pnpm build
rm -rf deploy/smogon
node tools/deploy/index.ts run smogon.deploy.js -o deploy/smogon

# Note: the /forums/media/pmd directory should probably stay the same; we can redirect those I guess
rsync -a deploy/smogon/pmd/ smogon:/smog2/forumsprites/pmd
