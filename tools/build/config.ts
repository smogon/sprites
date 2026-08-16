
import fs from 'fs';

export function parseConfig(text : string) : Map<string, string> {
    const result = new Map<string, string>();
    for (let line of text.split('\n')) {
        line = line.trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const eq = line.indexOf('=');
        if (eq === -1) {
            throw new Error(`Invalid config line: ${line}`);
        }
        result.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    }
    return result;
}

export function loadConfig(path : string) : Map<string, string> {
    if (!fs.existsSync(path)) {
        return new Map();
    }
    return parseConfig(fs.readFileSync(path, 'utf8'));
}
