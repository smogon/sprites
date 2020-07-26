
type SpriteDataAttrs = {id : number | string,
                        extra : [string, string][]};

export class SpriteData {
    public readonly id : number | string;
    private extra : Map<string, string>;
    
    constructor({id, extra}: SpriteDataAttrs) {
        this.id = id;
        this.extra = new Map;
        for (const [k,v] of extra) {
            if (v === "") {
                // Don't store empty entries. Can't just avoid set()-ing,
                // because might set "" after another entry to blot it out
                this.extra.delete(k);
            } else {
                this.extra.set(k, v);
            }
        }
    }

    get(x : string) : string {
        return this.extra.get(x) ?? "";
    }

    [Symbol.iterator]() {
        return this.extra[Symbol.iterator]();
    }

    static parse(s : string) {
        const parts = s.split("-");
        const id = parts[0].match(/^[0-9]+$/) ? parseInt(parts[0], 10) : parts[0];
        const extra : [string, string][] = [];
        for (const part of parts.slice(1)) {
            if (part.length === 0)
                throw new Error(`Can't parse ${s}`);
            extra.push([part[0], part.slice(1)]);
        }
        return new SpriteData({id, extra});
    }
    
    update({id, extra} : Partial<SpriteDataAttrs>) {
        return new SpriteData({id : id ?? this.id,
                               extra: [...this, ...(extra ?? [])]});
    }
    
    format() {
        let s = this.id.toString();
        const extra = Array.from(this);
        extra.sort(([k1,], [k2,]) => {
            if (k1 < k2) {
                return -1;
            } else if (k1 > k2) {
                return 1;
            } else {
                return 0;
            }
        });
        for (const [k, v] of extra) {
            s += `-${k}${v};`
        }
        return s;
    }
}
