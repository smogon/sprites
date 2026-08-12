#!/bin/bash

set -ex

cd ~/smogon/sprites
./build.sh

# Update dex
cd ~/smogon/smogon.com/run
rm -rf ~/smogon/sprites/build/smogon/spritesheetoutput
pnpm exec esbuild ~/smogon/sprites/build/smogon/spritesheet.css --asset-names='[name]-[hash]' --entry-names='[name]-[hash]' --loader:.webp=copy --minify --allow-overwrite --bundle --outdir=/home/monsanto/smogon/sprites/build/smogon/spritesheetoutput
zopfli ~/smogon/sprites/build/smogon/spritesheetoutput/spritesheet-*.css
brotli -9 ~/smogon/sprites/build/smogon/spritesheetoutput/spritesheet-*.css
rsync ~/smogon/sprites/build/smogon/spritesheetoutput/* smogon:/smog2/sprites/assets
python -c 'import re; import pathlib; print(re.match(r"spritesheet(.*)\.css", str(list(pathlib.Path("/home/monsanto/smogon/sprites/build/smogon/spritesheetoutput/.").glob("spritesheet-*.css"))[0].name)).group(1))' | ssh smogon 'cat > /smog2/dex/spritesheet_css_suffix.txt'
ssh smogon 'systemctl reload dex'

# Update forum minisprites
cd /home/monsanto/smogon/sprites
rm -rf deploy/smogon
node tools/deploy run smogon.deploy.js -o deploy/smogon
rsync -a deploy/smogon/forumsprites/ smogon:/smog2/forumsprites/minisprites
rsync -a deploy/smogon/xyicons/ smogon:/smog2/sprites/xyicons
