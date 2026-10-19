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

## Building

Install dependencies once with `pnpm install`.

Each output tree is a root `*.build.ts` module: it declares its build rules
(shared sets are plain functions in `rules/`; declaring an identical rule
twice is a no-op returning the existing artifacts, so any number of modules
can call the same set) and, next to each set of rules, a `deploy(ctx => ...)`
block that maps the built artifacts to their published names; the blocks run
in registration order after the build, sharing one output tree per module. Build outputs are content-addressed:
rules declare nominal output filenames but the store names every object by
the hash of its bytes (under `.build/cas/`), so incrementality keys on
content, same-byte renames rebuild nothing, and hash-stamped publishing
reuses the build's digests. All state lives in `.build/`.

```
$ pnpm build                                     # build every module's rules, GC stale state
$ node tools/deploy/index.ts build smogon.build.ts  # build one module's rules
$ node tools/deploy/index.ts run smogon.build.ts -o /tmp/out
$ node tools/deploy/index.ts publish smogon.build.ts --tree /srv/served --meta /srv/publishes/1
$ node tools/deploy/index.ts inspect src/minisprites/items/ileftovers.png -o /tmp/out
$ node tools/deploy/index.ts refactor --record       # remember what the modules publish
$ node tools/deploy/index.ts refactor                # and what a change did to it
```

`run` materializes a module's outputs to a directory (`--link` hardlinks)
without publishing anything. `inspect` builds every rule that consumes the
given source paths and copies the outputs out under readable names for
eyeballing.

`refactor` answers "did that change anything we ship". It builds, runs the
deploy blocks, and digests the bytes landing at every published name, then
prints what was added, removed or modified since the last `--record` and exits
non-zero if anything was. A built artifact's CAS path already spells its
digest, so only raw sources are read; the baseline sits in `.build/` and is
per-checkout. Record on the commit you are comparing against, make the change,
run it again.

Useful flags: `-j <n>` parallelism, `-n` dry run, `-v` verbose,
`--fail-fast` stop after the first failure.

A build can be interrupted at any point (SIGINT or SIGTERM: running rules are
stopped, a second signal kills them) and picks up where it left off next time.

## Publishing

`publish <file> --tree <dir> --meta <dir>` builds, runs the module's deploy
blocks and places the outputs for serving. The output root is the served
tree, and `__meta/` at the root is everything that isn't served.

The tree is add-only. Every name in it carries a content hash and is served
as if it can never change, so a name already there is the same file and is
touched rather than rewritten, and one there at another size fails the
publish. New files are hardlinked from the CAS where they can be and written
beside their final name and renamed into place otherwise, so nothing ever
reads a half-written file.

`--meta` is this publish's own directory and is written whole. Three kinds of
thing ride there. A manifest, `name` -> the whole url of the stamped file,
for a reader that looks one up. A pointer file naming a single url, for the
one-file sets. And `__meta/links/`, the served tree recreated as symlinks
under the un-stamped names, which is the same mapping said in names instead
of a file; it lives out here rather than in the tree because the tree is
add-only and a link is repointed on every publish. A link names where in the
output its file is (`__meta/links/xy/charizard.gif` names
`xy/charizard-<hash>.gif`), and the publish points it at where that file sits
in the tree; a link to anything the publish doesn't carry is refused. The
publish also writes `__files`, every tree name it stands behind, and
`__digest`, a digest of every name and the bytes under it; names under
`__meta/` starting with `__` are reserved for these.

Production runs this: smogon.com's `sprites-sync` service fetches this
repository, runs `build` and then `publish`, swaps the meta directory in for
its readers and sweeps tree files no publish has named for a while. Each
checkout's `build.config` is written by whoever made the checkout.

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
