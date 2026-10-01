import atlasCatalog from '../../../public/assets/sprites/atlas-index.json';

type SpriteNode = {
    label?: string;
    children?: SpriteNode[];
    childen?: SpriteNode[];
};

type AtlasCatalog = {
    sprites?: SpriteNode[];
};

// Token `ob_*` de una etiqueta del atlas (p. ej. "Puerto__ob_papelera__g12" → "ob_papelera").
export const spriteToken = (label: string): string | null =>
    label.split('__').find((part) => part.startsWith('ob_')) ?? null;

const countSpritesByToken = (nodes: SpriteNode[]): Map<string, number> => {
    const counts = new Map<string, number>();

    const walk = (node: SpriteNode): void => {
        const children = Array.isArray(node.children)
            ? node.children
            : (Array.isArray(node.childen) ? node.childen : []);

        if (children.length > 0) {
            children.forEach(walk);
            return;
        }

        const token = typeof node.label === 'string' ? spriteToken(node.label) : null;

        if (token) {
            counts.set(token, (counts.get(token) ?? 0) + 1);
        }
    };

    nodes.forEach(walk);

    return counts;
};

// Cuántos sprites hay en la escena por cada token `ob_*`.
export const spriteCountByToken: ReadonlyMap<string, number> =
    countSpritesByToken((atlasCatalog as AtlasCatalog).sprites ?? []);
