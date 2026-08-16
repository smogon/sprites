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

Install dependencies once with `pnpm install`. Then, to build:

```
$ node tools/build/index.ts
```

The rules live in `Buildfile.ts`. Build state (content hashes, rule records)
is kept in `.build/`; outputs of removed rules are deleted automatically, and
renamed sources are detected and their outputs copied instead of rebuilt.

Useful flags: `-j <n>` parallelism, `-n` dry run, `-v` verbose,
`--adopt` record already-existing `build/` outputs as up to date instead of
rebuilding them (useful when `build/` was produced elsewhere).

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
  them with the rule's `deps:` in `Buildfile.ts` so changes are detected.

## License

All code in this repository is licensed under the [MIT License](https://opensource.org/licenses/MIT).

The sprites themselves are property of Nintendo / Game Freak / The Pokémon Company, though Black & White sprites for Pokémon from later generations were created by artists in the community. The license for these community-created sprites is still being determined and may change in the future, but in the meantime please talk to use first before using them.

The PMD sprites are from [SpriteCollab](https://sprites.pmdcollab.org/). The exact list of contributors can be found in `spritecollab_credit_names.txt` of this repository.
