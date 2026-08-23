// The sprite filename grammar.
//
//     <kind><name>[-o<forme>][-<flag>...]
//
//     kind   s specie, i item, x literal (Egg, Substitute, ...)
//     name   the encoded name, [a-z0-9_]+
//     flags  -o forme  -b back  -s shiny  -a asymmetrical  -f female
//            -g gmax or -g<game>  -v<vendor>  -c<slot>
//
// A name is encoded rather than spelled, because the two places these sprites
// are published disagree about what a word boundary is: smogon writes
// `mr-mime` and `ho-oh`, PS writes `mrmime` and `hooh`. Recording where the
// boundaries are lets both fall out of the filename, so nothing needs a table
// of names to publish.

export type Kind = 's' | 'i' | 'x';

export type SpriteFilename = {
    kind: Kind,
    name: string,
    extra: Map<string, string>
};

export type InputSpriteFilename = {
    kind: Kind,
    name: string,
    extra?: Map<string, string>
};

// A run of non-alphanumerics becomes _ when it separates words and vanishes
// otherwise, so `Ho-Oh` and `Mr. Mime` both encode with one boundary and
// `Farfetch’d` with none. Decompose first: accents are then dropped on
// purpose, rather than by accident of whether the source spelled them
// composed.
export function encode(s: string): string {
    return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, m => /[ _-]/.test(m) ? '_' : '');
}

// The two readings of an encoded name.
export function smogon(e: string): string {
    return e.replace(/_/g, '-');
}

export function psid(e: string): string {
    return e.replace(/_/g, '');
}

// A published name: the name and its forme joined with a dash, then the
// variant flags, which both sides spell the same way.
export function publishedName(sn: SpriteFilename, part: (e: string) => string): string {
    let name = part(sn.name);
    let forme = sn.extra.get('o');
    if (forme) {
        name += `-${part(forme)}`;
    }
    if (sn.extra.has('f')) {
        name += '-f';
    }
    if (sn.extra.has('g')) {
        name += '-gmax';
    }
    return name;
}

// Items whose sprite ships under more than one name, because the games renamed
// them. The modern name is the filename; these are the ones that also have to
// resolve. Keyed and valued in encoded form.
export const ITEM_ALIASES: Record<string, string[]> = {
    aspear_berry: ['burnt_berry'],            // Aspear Berry / Burnt Berry
    cheri_berry: ['prz_cure_berry'],          // Cheri Berry / PRZ Cure Berry
    chesto_berry: ['mint_berry'],             // Chesto Berry / Mint Berry
    leek: ['stick'],                          // Leek / Stick
    leppa_berry: ['mystery_berry'],           // Leppa Berry / Mystery Berry
    lum_berry: ['miracle_berry'],             // Lum Berry / Miracle Berry
    oran_berry: ['berry'],                    // Oran Berry / Berry
    pecha_berry: ['psn_cure_berry'],          // Pecha Berry / PSN Cure Berry
    persim_berry: ['bitter_berry'],           // Persim Berry / Bitter Berry
    rawst_berry: ['ice_berry'],               // Rawst Berry / Ice Berry
    silk_scarf: ['pink_bow', 'polkadot_bow'], // Silk Scarf / Pink Bow / Polkadot Bow
    sitrus_berry: ['gold_berry'],             // Sitrus Berry / Gold Berry
};

// The second name a sprite answers to, where one picture publishes twice.
// Meowstic is a disagreement: PS's is the male, baseForme M with Meowstic-F the
// alt forme, while the dex splits the pair evenly and calls that entry
// Meowstic-M. Toxtricity is a shortage: the games drew one Gigantamax
// Toxtricity and not two, which is why PS's own icon sheet gives Amped and
// Low-Key a single slot and its animations no low-key gmax at all. Keyed and
// valued in published smogon form, because only that side asks; PS wants
// `meowstic` and `toxtricitygmax`, which is what the filenames already say.
export const SPECIES_ALIASES: Record<string, string[]> = {
    meowstic: ['meowstic-m'],
    'toxtricity-gmax': ['toxtricity-low-key-gmax'],
};

// Every name a sprite answers to on the smogon side: its own, and any alias.
export function smogonNames(sn: SpriteFilename): string[] {
    let name = publishedName(sn, smogon);
    return [name, ...SPECIES_ALIASES[name] ?? []];
}

export function parseFilename(s: string): SpriteFilename {
    if (s.length < 2)
        throw new Error(`Filename ${s} needs to be at least 2 characters`);

    let kind = s.charAt(0);
    if (kind !== 's' && kind !== 'i' && kind !== 'x')
        throw new Error(`Filename ${s} must start with s, i or x`);

    let parts = s.split('-');
    let first = parts[0];
    if (first === undefined)
        throw new Error(`Can't parse ${s}`);

    let extra = new Map<string, string>();
    for (let part of parts.slice(1)) {
        if (part.length === 0)
            throw new Error(`Can't parse ${s}`);
        extra.set(part.charAt(0), part.slice(1));
    }

    return {kind, name: first.slice(1), extra};
}

export function formatFilename(si: InputSpriteFilename): string {
    let s = `${si.kind}${si.name}`;

    // The forme leads, so a forme's whole set of sprites sorts together
    // instead of interleaving with the base forme's by flag letter.
    let forme = si.extra?.get('o');
    if (forme !== undefined) {
        s += `-o${forme}`;
    }

    let extra = [];
    for (let [k, v] of si.extra?.entries() ?? []) {
        if (k !== 'o') {
            extra.push(`-${k}${v}`);
        }
    }
    extra.sort();
    return s + extra.join('');
}
