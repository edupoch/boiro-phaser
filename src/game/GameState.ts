import spriteCatalog from '../../public/assets/sprites/sprites.json';
import { getSpriteLabelText } from './SpriteLabelText.ts';

type SpriteNode = {
    label?: string;
    children?: SpriteNode[];
    childen?: SpriteNode[];
};

export interface GameTargetState {
    id: string;
    name: string;
    labels: string[];
    total: number;
    found: number;
}

export interface GameStateSnapshot {
    targets: GameTargetState[];
    totalToFind: number;
    totalFound: number;
    remaining: number;
}

type Listener = () => void;

const normalizeTargetId = (label: string): string => {
    const parts = label.split('__');
    const targetPart = parts.find((part) => part.startsWith('ob_'));

    return targetPart ?? label;
};

const formatTargetName = (id: string): string => {
    const mappedText = getSpriteLabelText(id);

    if (mappedText) {
        return mappedText;
    }

    const rawName = id.replace(/^ob_/, '').replace(/_/g, ' ');

    return rawName
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const collectTargets = (nodes: SpriteNode[]): GameTargetState[] => {
    const groupedTargets = new Map<string, GameTargetState>();

    const walk = (node: SpriteNode): void => {
        const children = Array.isArray(node.children)
            ? node.children
            : (Array.isArray(node.childen) ? node.childen : []);

        if (children.length > 0) {
            children.forEach(walk);
            return;
        }

        if (typeof node.label !== 'string' || !node.label.includes('ob_')) {
            return;
        }

        const targetId = normalizeTargetId(node.label);
        const currentTarget = groupedTargets.get(targetId);

        if (currentTarget) {
            currentTarget.total += 1;
            currentTarget.labels.push(node.label);
            return;
        }

        groupedTargets.set(targetId, {
            id: targetId,
            name: formatTargetName(targetId),
            labels: [node.label],
            total: 1,
            found: 0,
        });
    };

    nodes.forEach(walk);

    return Array.from(groupedTargets.values()).sort((left, right) => left.name.localeCompare(right.name));
};

const cloneTarget = (target: GameTargetState): GameTargetState => ({
    ...target,
    labels: [...target.labels],
    found: 0,
});

const pickRandomTargets = (targets: GameTargetState[], count: number): GameTargetState[] => {
    const shuffledTargets = targets.map(cloneTarget);

    for (let index = shuffledTargets.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledTargets[index], shuffledTargets[swapIndex]] = [shuffledTargets[swapIndex], shuffledTargets[index]];
    }

    return shuffledTargets.slice(0, Math.min(count, shuffledTargets.length));
};

class GameStateStore {
    private listeners = new Set<Listener>();
    private allTargets: GameTargetState[];
    private targets: GameTargetState[];

    constructor(targets: GameTargetState[]) {
        this.allTargets = targets;
        this.targets = pickRandomTargets(this.allTargets, 5);
    }

    getSnapshot(): GameStateSnapshot {
        const targets = this.targets.map((target) => ({
            ...target,
            labels: [...target.labels],
        }));
        const totalToFind = targets.reduce((sum, target) => sum + target.total, 0);
        const totalFound = targets.reduce((sum, target) => sum + target.found, 0);

        return {
            targets,
            totalToFind,
            totalFound,
            remaining: totalToFind - totalFound,
        };
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    reset(): void {
        this.targets = pickRandomTargets(this.allTargets, 5);
        this.emit();
    }

    markFound(targetKey: string, amount = 1): void {
        let updated = false;

        this.targets = this.targets.map((target) => {
            const matchesTarget = target.id === targetKey || target.labels.includes(targetKey);

            if (!matchesTarget || target.found >= target.total) {
                return target;
            }

            updated = true;

            return {
                ...target,
                found: Math.min(target.total, target.found + amount),
            };
        });

        if (updated) {
            this.emit();
        }
    }

    private emit(): void {
        this.listeners.forEach((listener) => listener());
    }
}

const initialTargets = collectTargets(spriteCatalog as SpriteNode[]);

export const gameState = new GameStateStore(initialTargets);
