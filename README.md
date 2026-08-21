# Pokémon Sprites

> The Smogon / Pokémon Showdown! sprite repository.

## Installation

This project depends on

- [ImageMagick](http://www.imagemagick.org/) >= 7
- [gifsicle](https://www.lcdf.org/gifsicle/)
- [AdvPng](http://www.advancemame.it/doc-advpng.html) (optional)
- [OptiPNG](http://optipng.sourceforge.net/) (optional)
- [pngquant](https://pngquant.org/) (optional)
- [pnpm](https://pnpm.js.org)
- [node.js](https://nodejs.org) >= 24
- cwebp

### Windows

Windows binaries of these dependencies can be found on the download pages of the sites listed above.

### Linux

```
$ sudo apt install nodejs imagemagick gifsicle advancecomp optipng pngquant webp
$ sudo npm install -g pnpm
```

You may have to build imagemagick from source to get version 7.

```
$ sudo apt install build-essential pkg-config libltdl-dev libperl-dev libpng-dev libjpeg-dev
$ wget https://imagemagick.org/download/ImageMagick.tar.gz
$ tar xf ImageMagick.tar.gz
$ cd ImageMagick-*
$ ./configure --with-modules --enable-shared --with-perl
$ sudo make -j install
$ sudo ldconfig /usr/local/lib
```

### macOS

Using [`brew`](https://brew.sh/) on  a macOS:

```
$ brew install imagemagick gifsicle advancecomp optipng pngquant webp
```

## Building and deploying

Install dependencies once with `pnpm install`.

Each deploy is a root `*.build.ts` module: it declares its build rules
(shared sets are plain functions in `rules/`; declaring an identical rule
twice is a no-op returning the existing artifacts, so any number of deploys
can call the same set) and, next to each set of rules, a `deploy(ctx => ...)`
block that maps the built artifacts to their published names; the blocks run
in registration order after the build, sharing one output tree per module. Build outputs are content-addressed:
rules declare nominal output filenames but the store names every object by
the hash of its bytes (under `.build/cas/`), so incrementality keys on
content, same-byte renames rebuild nothing, and hash-stamped publishing
reuses the build's digests. All state lives in `.build/`.

```
$ pnpm build                                     # build every deploy's rules, GC stale state
$ pnpm deploy                                    # list the deploys in deploy.json5
$ pnpm deploy assets                             # run a named deploy
$ node tools/deploy/index.ts build ps.build.ts   # build one deploy's rules
$ node tools/deploy/index.ts run smogon.build.ts -o deploy/smogon
$ node tools/deploy/index.ts inspect src/minisprites/items/i1.png -o /tmp/out
```

`run` materializes a deploy to a directory (`--link` hardlinks, `--tar`
writes a tar file) without uploading anything. `inspect` builds every rule
that consumes the given source paths and copies the outputs out under
readable names for eyeballing.

Useful flags: `-j <n>` parallelism, `-n` dry run, `-v` verbose,
`--fail-fast` stop after the first failure.

## Deploying

`deploy` reads `deploy.json5` at the repo root (not tracked by git). It maps
deploy names to a buildFile and a list of (subset, cmd) entries: after
building and finishing the buildFile, each entry's globs select a subset of
the finish outputs, which are tarred and piped to the entry's command on
stdin. An entry with `dir: true` instead materializes the subset into a temp
directory whose path replaces `%d` in the command (for rsync-style
transports). Every glob must match something, and every output must be
covered by some entry. `deploy <name> -o <dir>` materializes each entry's
subset under `<dir>/<name>/<entry index>/` instead of running its command,
for eyeballing what would ship.

```json5
{
    assets: {
        buildFile: "assets.build.ts",
        deploy: [
            {subset: ["**"], cmd: "smogonctl assets upload sprites"},
        ],
    },
    ps: {
        buildFile: "ps.build.ts",
        deploy: [
            {subset: ["ani/**"], dir: true, cmd: "rsync -a %d/ani/ ps:sprites/ani/"},
        ],
    },
}
```

### The asset upload's tar layout

`smogonctl assets upload` publishes a tar into a served tree under a prefix
named in the receiving home's `services.toml`, which this side can't read. So
`assets.build.ts` writes that prefix itself -- everything served ships under
`sprites/` -- and the upload rejects a tar whose tree disagrees. The two are
checked against each other instead of each guessing, which is what lets the
manifests and pointers in `__meta/` name whole urls (`/__assets/sprites/...`)
and their readers hold no configuration at all.

`__meta/` is the exception and stays at the tar root: the upload diverts it to
`assets-meta/`, beside the served tree rather than in it, because a served
name carries a content hash and something un-stamped has to say which name to
ask for.

## Configuration

Build settings are configurable in `build.config` (not tracked by git).

- `DEFAULT_OPTIPNG`: Command line to pass to `optipng`.
- `DEFAULT_ADVPNG`: Command line to pass to `advpng`.
- `DEFAULT_PNGQUANT`: Command line to pass to `pngquant`.

There are src-specific versions of these settings:

- `TRAINERS_<PROGRAM>`: Compression options for `trainers/` only.
- `DEX_<PROGRAM>`: Compression options for `dex/` only.
- `MODELS_<PROGRAM>`: Compression options for `models/` only.
- `SPRITESHEET_<PROGRAM>`: Compression options for spritesheets only.
- `MINISPRITE_<PROGRAM>`: Compression options for `minisprites/` only.

For example, these settings reflect the compression settings for the files chaos uploaded in `src/`:
```
DEFAULT_OPTIPNG=-o7
DEFAULT_ADVPNG=-z4 -i5000
```

## Gotchas

- The build tool only tracks the inputs a rule declares. If a build tool reads
  files that aren't on its command line (e.g. it does a `readdir()`), declare
  them with the rule's `deps:` so changes are detected.
- Rule identity is content-only by default: renaming a source without
  changing its bytes rebuilds nothing. If a tool bakes input *names* into
  its output bytes (the spritesheet builders do), the rule must set
  `nameSensitive: true` or renames will leave its output silently stale.
- Rules must be declared when a deploy module is imported (top level), not
  inside a `deploy` block — the build runs before the blocks do.
- A rule's inputs are source paths; one rule never consumes another's output.
  Multi-step work is several `cmds` in one rule, with `%oN` to feed a later
  step from an earlier output (the Smogdex sheet emits its png, css, and
  webp that way).

## License

All code in this repository is licensed under the [MIT License](https://opensource.org/licenses/MIT).

The sprites themselves are property of Nintendo / Game Freak / The Pokémon Company, though Black & White sprites for Pokémon from later generations were created by artists in the community. The license for these community-created sprites is still being determined and may change in the future, but in the meantime please talk to use first before using them.

The PMD sprites are from [SpriteCollab](https://sprites.pmdcollab.org/). The exact list of contributors can be found in `spritecollab_credit_names.txt` of this repository.
