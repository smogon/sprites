#!/bin/bash

set -ex

cd ~/smogon/sprites
pnpm build

rm -rf deploy/smogon
node tools/deploy/index.ts run smogon.deploy.js -o deploy/smogon

# Update dex
rsync deploy/smogon/assets/* smogon:/smog2/sprites/assets
ssh smogon 'cat > /smog2/dex/spritesheet_css_suffix.txt' < deploy/smogon/spritesheet_css_suffix.txt
ssh smogon 'systemctl reload dex'

# Update forum minisprites
rsync -a deploy/smogon/forumsprites/ smogon:/smog2/forumsprites/minisprites
rsync -a deploy/smogon/xyicons/ smogon:/smog2/sprites/xyicons
