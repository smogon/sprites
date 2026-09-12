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
$ pnpm deploy smogon                             # run a named deploy
$ node tools/deploy/index.ts build smogon.build.ts  # build one deploy's rules
$ node tools/deploy/index.ts run smogon.build.ts -o deploy/smogon
$ node tools/deploy/index.ts inspect src/minisprites/items/ileftovers.png -o /tmp/out
$ node tools/deploy/index.ts refactor --record       # remember what the deploys publish
$ node tools/deploy/index.ts refactor                # and what a change did to it
```

`run` materializes a deploy to a directory (`--link` hardlinks, `--tar`
writes a tar file) without uploading anything. `inspect` builds every rule
that consumes the given source paths and copies the outputs out under
readable names for eyeballing.

`refactor` answers "did that change anything we ship". It builds, runs the
deploy blocks, and digests the bytes landing at every published name, then
prints what was added, removed or modified since the last `--record` and exits
non-zero if anything was. A built artifact's CAS path already spells its
digest, so only raw sources are read; the baseline sits in `.build/` and is
per-checkout. Record on the commit you are comparing against, make the change,
run it again.

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

Where stderr is a terminal, each entry draws a progress bar over its files
while they go out -- an entry counts once the command has taken it, not once
it has been read off disk -- and the line is cleared again afterwards. Piped
or under CI nothing is drawn, and the lines the deploy prints are the same
either way.

This file is not committed, because it is where the hosts and paths this
repo ships to are written down.

```json5
{
    smogon: {
        buildFile: "smogon.build.ts",
        deploy: [
            {subset: ["**"], cmd: "smogonctl assets upload sprites"},
        ],
    },
}
```

Note that the coverage rule is per deploy name, over the whole buildFile's
outputs: two names on one buildFile can't split its tree between them, since
each of them has to cover all of it.

### The asset upload's tar layout

`smogonctl assets upload` publishes a tar into a served tree under a prefix
named in the receiving home's `services.toml`, which this side can't read. So
`smogon.build.ts` writes that prefix itself -- everything served ships under
`sprites/` -- and the upload rejects a tar whose tree disagrees. The two are
checked against each other instead of each guessing, which is what lets the
manifests and pointers in `__meta/` name whole urls (`/__assets/sprites/...`)
and their readers hold no configuration at all.

`__meta/` is the exception and stays at the tar root: the upload diverts it to
`assets-meta/`, beside the served tree rather than in it, because a served
name carries a content hash and something un-stamped has to say which name to
ask for.

Three kinds of thing ride there. A manifest, `name` -> the whole url of the
stamped file, for a reader that looks one up. A pointer file naming a single
url, for the one-file sets. And `__meta/links/`, the served tree recreated as
symlinks under the un-stamped names, which is the same mapping said in names
instead of a file. It lives out here rather than in the tree because the tree
is add-only -- a name in it is promised never to change -- and a link is
repointed on every upload.

A link says where in the tar its file is, not what to write into the link:
`__meta/links/xy/charizard.gif` names `sprites/xy/charizard-<hash>.gif` and
what is packed is the path between the two. The two halves land in different
trees on the far side (`assets-meta/<key>/` and `assets/`), so the upload
retargets every link at where its asset actually went, and refuses one naming
anything that tar didn't carry. The mirror doesn't repeat the `sprites/`
prefix, since the directory it lands in is already this set's.

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
