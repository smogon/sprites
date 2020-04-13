# Pokémon Sprites

> The Smogon / Pokémon Showdown! sprite repository.

## Installation

This project depends on

- [tup](http://gittup.org/tup/)
- [GraphicsMagick](http://www.graphicsmagick.org/)
- [AdvPng](http://www.advancemame.it/doc-advpng.html)

### Windows

Windows binaries of these dependencies can be found on the download pages of the sites listed above.

### Linux

_**TODO:** include installation instructions for `tup` given the Ubuntu PPA is defunct_

```
$ sudo apt install graphicsmagick advancecomp
```

### macOS

Using [`brew`](https://brew.sh/) on  a macOS:

```
$ brew cask install osxfuse
$ brew install tup graphicsmagick advancecomp
```

## Building

```
$ tup
```

## Filename Scheme

Pokemon sprite filenames are in a 1-to-1 correspondence with the Pokemon's name, for ease of processing. Filenames may be directly substituted in shell commands without escaping. This naming scheme means that some of the filenames in `src/` are a little awkward looking to humans, but it means that no additional data beyond what is encoded in the filesystem is required to determine the correct name for any given Pokémon. 

- Characters outside `[0-9a-zA-Z-.]` will be escaped using `_` and four hex characters, similar to JavaScript Unicode escapes. This conforms to the POSIX portable filename character set. (example: `Flabébé` -> `Flabe_0301be_0301`)

    The following JS function may be useful:
     ```javascript
    function encode(s) {
        return s.replace(/[^0-9a-zA-Z-.]/g, c => '_' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    }
    ```

- Formes are separated with two dashes from their base. (example: `Necrozma--Dawn-Wings`)

- Cosmetic female formes are `--Female` instead of `--F`, so that you may distinguish it from Unown.

## License

All code in this repository is licensed under the [MIT License](https://opensource.org/licenses/MIT).

The sprites themselves are property of Nintendo / Game Freak / The Pokémon Company, though Black & White sprites for Pokémon from later generations were created by artists in the community. The license for these community-created sprites is still being determined and may change in the future, but in the meantime please talk to use first before using them.
