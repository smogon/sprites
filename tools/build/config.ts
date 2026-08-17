
import * as fs from 'node:fs/promises';

export function parseConfig(text: string): Map<string, string> {
    let result = new Map<string, string>();
    for (let line of text.split('\n')) {
        line = line.trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        let eq = line.indexOf('=');
        if (eq === -1) {
            throw new Error(`Invalid config line: ${line}`);
        }
        result.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
    }
    return result;
}

export async function loadConfig(path: string): Promise<Map<string, string>> {
    let text;
    try {
        text = await fs.readFile(path, 'utf8');
    } catch (err) {
        if ((err as {code?: string}).code === 'ENOENT') {
            return new Map();
        }
        throw err;
    }
    return parseConfig(text);
}
