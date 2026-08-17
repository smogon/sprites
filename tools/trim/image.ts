
import * as cp from 'node:child_process';
import * as util from 'node:util';

let execFile = util.promisify(cp.execFile);

export async function getDims(input: string) {
    let {stdout: info} = await execFile('magick',
        ['convert', input, '-format', '%w+%h+%@', 'info:'], {encoding: 'utf8'});

    let [imageWidth, imageHeight, width, height, left, top] =
          info.split(/x|\+/g).map(dim => parseInt(dim)) as [number, number, number, number, number, number];

    let right = imageWidth - (left + width);
    let bottom = imageHeight - (top + height);

    return {
        width,
        height,
        left,
        top,
        right,
        bottom
    }
}

export async function crop(input: string, {width, height, left, top}: {width: number, height: number, left: number, top: number}, output: string) {
    await execFile('magick', ['convert', input, '+repage', '-crop', `${width}x${height}+${left}+${top}`, output]);
}

// Trim, preserving displacement from center
// Returns crop coords
export function losslessTrim(dims: {width: number, height: number, left: number, top: number, bottom: number, right: number}) {
    return {
        left: Math.min(dims.left, dims.right),
        width: dims.width + Math.abs(dims.left - dims.right),
        top: Math.min(dims.top, dims.bottom),
        height: dims.height + Math.abs(dims.top - dims.bottom),
    }
}
