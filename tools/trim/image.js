
import cp from 'child_process';

export function getDims(input) {
    const info = cp.execFileSync('convert', [input, '-format', "%w+%h+%@", 'info:'],
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

export function crop(input, {width, height, left, top}, output) {
    cp.execFileSync('convert', [input, '+repage', '-crop', `${width}x${height}+${left}+${top}`, output]);
}

// Trim, preserving displacement from center
// Returns crop coords
export function losslessTrim(dims) {
    return {
        left: Math.min(dims.left, dims.right),
        width: dims.width + Math.abs(dims.left - dims.right),
        top: Math.min(dims.top, dims.bottom),
        height: dims.height + Math.abs(dims.top - dims.bottom),
    }
}
