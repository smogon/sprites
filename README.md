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

### Windows

Windows binaries of these dependencies can be found on the download pages of the sites listed above.

### Linux

```
$ sudo apt install nodejs imagemagick advancecomp optipng pngquant wine
$ sudo npm install -g pnpm
```

Build tup from source:

```
$ sudo apt install build-essential pkg-config libfuse-dev
$ git clone git://github.com/gittup/tup.git
$ cd tup
$ ./bootstrap.sh
$ sudo cp tup /usr/local/bin/tup
$ sudo cp tup.1 /usr/local/share/man
```

You may have to build imagemagick from source to get version 7.

```
$ sudo apt install build-essential pkg-config libltdl-dev libperl-dev libpng-dev
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
- `CONFIG_DEFAULT_DEFLOPT`: `true`, `false`, or blank

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
CONFIG_DEFAULT_DEFLOPT=true
```

## Filename Scheme

Pokemon sprite filenames are in a 1-to-1 correspondence with the Pokemon's name, for ease of processing. Filenames may be directly substituted in shell commands without escaping. This naming scheme means that some of the filenames in `src/` are a little awkward looking to humans, but it means that no additional data beyond what is encoded in the filesystem is required to determine the correct name for any given Pokémon. 

- Filenames must conform to the POSIX portable filename character set plus tilde, `[0-9a-zA-Z-._~]`. To ensure this, we encode filenames according to the following rules. Characters in `[0-9a-zA-Z-.~]` are left as-is. Spaces are converted to an underscore. Other characters are escaped using two underscores and four hex characters, similar to JavaScript Unicode escapes. (example: `Flabébé` -> `Flabe__0301be__0301`)

    The following JS functions may be useful:
     ```javascript
    function encode(s) {
        return s.replace(/[^0-9a-zA-Z-. ]/g, c => '__' + c.charCodeAt(0).toString(16).padStart(4, '0')).replace(" ", "_");
    }
    
    function decode(s) {
        return s.replace(/__(....)/g, (_, m) => String.fromCharCode(parseInt(m, 16))).replace("_", " ");
    }
    ```

- Pokemon filenames are of the form `<pokedex #>-<forme #>-<base name>-<forme name>`. Each component has `-` escaped as `~`. (example: `0006-001-Charizard-Mega~X`)

- Cosmetic female formes are `-Female` instead of `-F`, so that you may distinguish it from Unown.

## Gotchas

- Tup, like Git, tracks files, not directories. If you `readdir()` and forget to declare a dependency it won't catch it, like it would for `read()`. You can work around this by having build tools `stat()` any filenames they acquire.

- Using DeflOpt requires a custom build of tup. Checkout the repo and `git am vendor/tup-remove-fuse-context-check.patch`, and run with environment variable `TUP_NO_NAMESPACING=1`.

- DeflOpt performance can suffer under Wine due to repeatedly starting/shutting down `wineserver`. You can specify the server timeout with `wineserver -p<n>`, where `n` is the # of seconds (default 3). If you don't specify `n` it never shuts down. Sometimes wine will hang so you may want to instead pick something high like 30 seconds.

## License

All code in this repository is licensed under the [MIT License](https://opensource.org/licenses/MIT).

The sprites themselves are property of Nintendo / Game Freak / The Pokémon Company, though Black & White sprites for Pokémon from later generations were created by artists in the community. The license for these community-created sprites is still being determined and may change in the future, but in the meantime please talk to use first before using them.
