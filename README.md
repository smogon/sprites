
The Smogon/Pokemon-Showdown sprite repository

# Installation

You will need to install the Tup build system. Instructions for Windows/Mac/Linux can be found [here](http://gittup.org/tup/).

# Building

Run `tup`.

# Filename scheme

Pokemon sprite filenames are in a 1-to-1 correspondence with the Pokemon's name, for ease of processing. Filenames may be directly substituted in shell commands without escaping.

- Characters outside `[0-9a-zA-Z-.]` will be escaped using `_` and four hex characters, similar to JavaScript Unicode escapes. This conforms to the POSIX portable filename character set. (example: `Flabébé` -> `Flabe_0301be_0301`)

The following JS function may be useful:
```javascript
function encode(s) {
    return s.replace(/[^0-9a-zA-Z-.]/g, c => '_' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
```

- Formes are separated with two dashes from their base. (example: `Necrozma--Dawn-Wings`)

- Cosmetic female formes are `--Female` instead of `--F`, so that you may distinguish it from Unown.
