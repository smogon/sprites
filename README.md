# Pokémon Sprites

> The Smogon / Pokémon Showdown! sprite repository.

## Installation

This project depends on

- [tup](http://gittup.org/tup/)
- [ImageMagick](http://www.imagemagick.org/) >= 7
- [AdvPng](http://www.advancemame.it/doc-advpng.html) (optional)
- [OptiPNG](http://optipng.sourceforge.net/) (optional)
- [pngquant](https://pngquant.org/) (optional)
- [pnpm](https://pnpm.js.org)
- [node.js](https://nodejs.org) >= 13
- [wine](https://www.winehq.org/) (optional)
- cwebp

### Windows

Windows binaries of these dependencies can be found on the download pages of the sites listed above.

### Linux

```
$ sudo apt install nodejs imagemagick advancecomp optipng pngquant wine webp
$ sudo npm install -g pnpm
```

Build tup from source:

```
$ sudo apt install build-essential pkg-config fuse3 libfuse3-dev libpcre3-dev
$ git clone git://github.com/gittup/tup.git
$ cd tup
$ ./bootstrap.sh
$ sudo cp tup /usr/local/bin/tup
$ sudo cp tup.1 /usr/local/share/man
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
$ brew cask install osxfuse wine-stable
$ brew install tup imagemagick advancecomp optipng pngquant
```

## Building

Install dependencies once with `pnpm install`. Then, to build:

```
$ tup
```

## Configuration

Build settings are configurable in `tup.config`.

- `CONFIG_DEFAULT_OPTIPNG`: Command line to pass to `optipng`.
- `CONFIG_DEFAULT_ADVPNG`: Command line to pass to `advpng`.
- `CONFIG_DEFAULT_PNGQUANT`: Command line to pass to `pngquant`.

There are src-specific versions of these settings:

- `CONFIG_TRAINERS_<PROGRAM>`: Compression options for `trainers/` only.
- `CONFIG_DEX_<PROGRAM>`: Compression options for `dex/` only.
- `CONFIG_MODELS_<PROGRAM>`: Compression options for `models/` only.
- `CONFIG_SPRITESHEET_<PROGRAM>`: Compression options for spritesheets only.
- `CONFIG_MINISPRITE_<PROGRAM>`: Compression options for `minisprites/` only.

For example, these settings reflect the compression settings for the files chaos uploaded in `src/`:
```
CONFIG_DEFAULT_OPTIPNG=-o7
CONFIG_DEFAULT_ADVPNG=-z4 -i5000
```

## Gotchas

- Tup, like Git, tracks files, not directories. If you `readdir()` and forget to declare a dependency it won't catch it, like it would for `read()`. You can work around this by having build tools `stat()` any filenames they acquire.

## License

All code in this repository is licensed under the [MIT License](https://opensource.org/licenses/MIT).

The sprites themselves are property of Nintendo / Game Freak / The Pokémon Company, though Black & White sprites for Pokémon from later generations were created by artists in the community. The license for these community-created sprites is still being determined and may change in the future, but in the meantime please talk to use first before using them.

The PMD sprites are from [SpriteCollab](https://sprites.pmdcollab.org/). The exact list of contributors can be found in `spritecollab_credit_names.txt` of this repository.
