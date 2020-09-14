
import cp from 'child_process';

export function getDims(input : string) {
    const info = cp.execFileSync('magick', ['convert', input, '-format', "%w+%h+%@", 'info:'],
                                 {encoding:'utf8'});

    const [imageWidth, imageHeight, width, height, left, top] =
          info.split(/x|\+/g).map(dim => parseInt(dim));

    const right = imageWidth - (left + width);
    const bottom = imageHeight - (top + height);

    return {
        width,
        height,
        left,
        top,
        right,
        bottom
    }
}

export function crop(input : string, {width, height, left, top} : {width : number, height: number, left: number, top: number}, output : string) {
    cp.execFileSync('magick', ['convert', input, '+repage', '-crop', `${width}x${height}+${left}+${top}`, output]);
}

// Trim, preserving displacement from center
// Returns crop coords
export function losslessTrim(dims : {width : number, height: number, left: number, top: number, bottom: number, right: number}) {
    return {
        left: Math.min(dims.left, dims.right),
        width: dims.width + Math.abs(dims.left - dims.right),
        top: Math.min(dims.top, dims.bottom),
        height: dims.height + Math.abs(dims.top - dims.bottom),
    }
}
