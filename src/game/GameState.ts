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

export interface FoundTargetResult {
    id: string;
    name: string;
    found: number;
    total: number;
}

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

const initialTargets = collectTargets(spriteCatalog as SpriteNode[]);

const buildSnapshot = (targets: GameTargetState[]): GameStateSnapshot => {
    const totalToFind = targets.reduce((sum, target) => sum + target.total, 0);
    const totalFound = targets.reduce((sum, target) => sum + target.found, 0);

    return {
        targets,
        totalToFind,
        totalFound,
        remaining: totalToFind - totalFound,
    };
};

export const createInitialGameSnapshot = (targetCount = 5): GameStateSnapshot => {
    const targets = pickRandomTargets(initialTargets, targetCount).map((target) => ({
        ...target,
        labels: [...target.labels],
    }));

    return buildSnapshot(targets);
};

export const markFoundInSnapshot = (
    snapshot: GameStateSnapshot,
    targetKey: string,
    amount = 1,
): { snapshot: GameStateSnapshot; foundTarget: FoundTargetResult | null } => {
    let foundTarget: FoundTargetResult | null = null;

    const nextTargets = snapshot.targets.map((target) => {
        const matchesTarget = target.id === targetKey || target.labels.includes(targetKey);

        if (!matchesTarget || target.found >= target.total) {
            return target;
        }

        const nextFound = Math.min(target.total, target.found + amount);
        foundTarget = {
            id: target.id,
            name: target.name,
            found: nextFound,
            total: target.total,
        };

        return {
            ...target,
            found: nextFound,
        };
    });

    if (!foundTarget) {
        return { snapshot, foundTarget: null };
    }

    return {
        snapshot: buildSnapshot(nextTargets),
        foundTarget,
    };
};
