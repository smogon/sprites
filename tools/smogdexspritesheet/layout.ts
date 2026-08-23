
// The sheet is a stack of uniform grids, one region per grid, each cell the
// size of its region's widest and tallest sprite. A sprite's place in the
// sheet is then its index and nothing else, which is the whole of what the
// stylesheet has to say about it -- the alternative, a tight pack, has to
// spell two coordinates per sprite and costs about five times the css. The
// padding a uniform cell wastes is nearly free: lossless webp encodes
// transparency for almost nothing, and the sheet came out slightly smaller
// than the tight pack it replaced.

// A decoded sprite is opaque to us beyond its size.
export type Image = {width: number, height: number};

// One sprite in the sheet, and every class name that resolves to it: aliases
// share a cell rather than repeating the pixels.
export type Cell = {names: string[], image: Image};

// Items are their own region because their cell is 24x24 against pokemon's
// 40x30, and the dex sizes its item columns on that. `modifier` is the class
// the dex adds beside `sprite` to pick a region's geometry; the first region
// is the default and needs none.
export type Region = {name: string, modifier: string | null, cells: Cell[]};

export type Layout = Region & {cols: number, cellW: number, cellH: number, y: number};

export type Sheet = {layouts: Layout[], width: number, height: number};

// Where a cell's box sits in the sheet. The stylesheet says this same thing in
// css, and the two have to agree.
export function place(l: Layout, i: number): {x: number, y: number} {
    return {
        x: (i % l.cols) * l.cellW,
        y: l.y + Math.floor(i / l.cols) * l.cellH,
    };
}

export function pack(regions: Region[]): Sheet {
    let claimed = new Set<string>();
    for (let region of regions) {
        for (let cell of region.cells) {
            for (let name of cell.names) {
                // A name resolves to one cell. Two sprites claiming it -- a -v
                // vendor file beside the base name it varies, say -- used to
                // mean the last one read won, silently.
                if (claimed.has(name)) {
                    throw new Error(`${name}: claimed by two sprites`);
                }
                claimed.add(name);
            }
        }
    }

    // Laid out region by region down the sheet. The first sizes the sheet,
    // chosen to come out roughly square; the rest fill that width.
    let layouts: Layout[] = [];
    let width = 0;
    let height = 0;
    for (let region of regions) {
        if (region.cells.length === 0) {
            throw new Error(`${region.name}: no sprites`);
        }
        // Sorted by name so an index means the same thing from one build to
        // the next and the rules come out in order, which the compressor
        // likes. Compared by code unit rather than locale, so the sheet
        // doesn't depend on the machine that built it.
        let cells = [...region.cells].sort((a, b) => {
            let [x, y] = [a.names[0] ?? '', b.names[0] ?? ''];
            return x < y ? -1 : x > y ? 1 : 0;
        });
        let cellW = Math.max(...cells.map(c => c.image.width));
        let cellH = Math.max(...cells.map(c => c.image.height));
        let cols = width === 0
            ? Math.ceil(Math.sqrt(cells.length * cellH / cellW))
            : Math.max(1, Math.floor(width / cellW));
        layouts.push({...region, cells, cols, cellW, cellH, y: height});
        width = Math.max(width, cols * cellW);
        height += Math.ceil(cells.length / cols) * cellH;
    }
    return {layouts, width, height};
}

// One rule per region carries the geometry, and one declaration per sprite
// says which cell it is. Every constant in the geometry is computed from the
// layout, so the stylesheet and the image can't drift apart.
//
// The dex puts `sprite` on the element beside the `sprite-<name>` it already
// had, and the region's modifier too where there is one.
export function stylesheet(sheet: Sheet, url: string): string {
    let css = '';
    for (let l of sheet.layouts) {
        let col = `mod(var(--i),${l.cols})`;
        let row = `round(down,var(--i)/${l.cols},1)`;
        let offset = l.y === 0 ? '' : ` - ${l.y}px`;
        let geometry = `background-position:calc(${col}*-${l.cellW}px) ` +
            `calc(${row}*-${l.cellH}px${offset});height:${l.cellH}px`;
        css += l.modifier === null
            ? `.sprite{display:inline-block;background:url("${url}") no-repeat;${geometry};width:calc(var(--w)*1px)}\n`
            : `.sprite.${l.modifier}{${geometry}}\n`;
        for (let [i, cell] of l.cells.entries()) {
            let selector = cell.names.map(n => `.sprite-${n}`).join(',');
            css += `${selector}{--i:${i};--w:${cell.image.width}}\n`;
        }
    }
    return css;
}
