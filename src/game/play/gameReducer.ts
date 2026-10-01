// Reglas del juego como reducer puro: React solo pinta el estado (incluido el modal) y despacha acciones.
import { GAME_CONFIG } from '../config.ts';
import {
    CLUES,
    COMPANY_IDS,
    ENTRIES,
    entryCap,
    entryIdsForCompany,
    getEntry,
    getEntryForToken,
    spriteCountForEntry,
    totalForEntries,
    type CompanyId,
} from '../content/catalog.ts';
import { spriteToken } from '../content/sprites.ts';
import { createRng, shuffle } from './rng.ts';

export type Mode = 'idle' | 'game' | 'explore';

export const LEVEL_COUNT = 3;

export type ObjectiveKind = 'type' | 'clue' | 'company';

export interface Objective {
    kind: ObjectiveKind;
    // Id de la ficha, de la pista o de la empresa, según `kind`.
    refId: string;
    entryIds: string[];
    foundByEntry: Record<string, number>;
    total: number;
}

export type Modal =
    | { kind: 'ficha'; entryId: string; variant: 'game' | 'levelComplete' | 'explore' }
    | { kind: 'wrong'; attemptsLeft: number }
    | { kind: 'lost' }
    | { kind: 'won'; errors: number };

export type GameStatus = 'playing' | 'levelComplete' | 'lost' | 'won';

export interface GameState {
    mode: Mode;
    level: number;
    status: GameStatus;
    objectives: Objective[];
    // Etiquetas de sprite ya contadas en este nivel.
    countedSprites: string[];
    errors: number;
    // Fichas encontradas en toda la partida, para el resumen final.
    foundEntryIds: string[];
    modal: Modal | null;
}

export type GameAction =
    | { type: 'start'; seed: number }
    | { type: 'tap'; label: string }
    | { type: 'closeModal' }
    | { type: 'nextLevel'; seed: number }
    | { type: 'enterExplore' }
    | { type: 'idleReset' };

export const createInitialState = (mode: Mode = 'idle'): GameState => ({
    mode,
    level: 0,
    status: 'playing',
    objectives: [],
    countedSprites: [],
    errors: 0,
    foundEntryIds: [],
    modal: null,
});

export const makeObjective = (kind: ObjectiveKind, refId: string, entryIds: string[]): Objective => ({
    kind,
    refId,
    entryIds,
    foundByEntry: Object.fromEntries(entryIds.map((id) => [id, 0])),
    total: totalForEntries(entryIds),
});

export const objectiveFound = (objective: Objective): number =>
    Object.values(objective.foundByEntry).reduce((sum, found) => sum + found, 0);

const isObjectiveDone = (objective: Objective): boolean => objectiveFound(objective) >= objective.total;

export const playableCompanies = (): CompanyId[] =>
    COMPANY_IDS.filter((id) => totalForEntries(entryIdsForCompany(id)) >= GAME_CONFIG.level3MinObjects);

export const buildObjectives = (level: number, seed: number): Objective[] => {
    const random = createRng(seed);

    if (level === 1) {
        return shuffle(ENTRIES.filter((entry) => spriteCountForEntry(entry) > 0), random)
            .slice(0, GAME_CONFIG.level1Types)
            .map((entry) => makeObjective('type', entry.id, [entry.id]));
    }

    if (level === 2) {
        return shuffle(CLUES, random)
            .slice(0, GAME_CONFIG.level2Clues)
            .map((clue) => makeObjective('clue', clue.id, clue.entryIds));
    }

    const [company] = shuffle(playableCompanies(), random);

    return company ? [makeObjective('company', company, entryIdsForCompany(company))] : [];
};

const startLevel = (state: GameState, level: number, seed: number): GameState => ({
    ...state,
    mode: 'game',
    level,
    status: 'playing',
    objectives: buildObjectives(level, seed),
    countedSprites: [],
    modal: null,
});

const tapInGame = (state: GameState, label: string): GameState => {
    if (state.status !== 'playing' || state.countedSprites.includes(label)) {
        return state;
    }

    const token = spriteToken(label);

    if (!token) {
        return state;
    }

    const entry = getEntryForToken(token);

    if (entry) {
        const cap = entryCap(entry);
        const accepting = state.objectives.filter((objective) =>
            objective.entryIds.includes(entry.id) && objective.foundByEntry[entry.id] < cap);

        if (accepting.length > 0) {
            // El acierto cuenta para todos los objetivos que aún admiten esa ficha (las pistas pueden solaparse).
            const objectives = state.objectives.map((objective) => (accepting.includes(objective)
                ? {
                    ...objective,
                    foundByEntry: { ...objective.foundByEntry, [entry.id]: objective.foundByEntry[entry.id] + 1 },
                }
                : objective));
            const foundEntryIds = state.foundEntryIds.includes(entry.id)
                ? state.foundEntryIds
                : [...state.foundEntryIds, entry.id];
            const next: GameState = {
                ...state,
                objectives,
                countedSprites: [...state.countedSprites, label],
                foundEntryIds,
            };

            if (!objectives.every(isObjectiveDone)) {
                return { ...next, modal: { kind: 'ficha', entryId: entry.id, variant: 'game' } };
            }

            if (state.level >= LEVEL_COUNT) {
                return { ...next, status: 'won', modal: { kind: 'won', errors: state.errors } };
            }

            return { ...next, status: 'levelComplete', modal: { kind: 'ficha', entryId: entry.id, variant: 'levelComplete' } };
        }

        // Es objetivo, pero ya se encontraron todas las unidades que se piden: no penaliza.
        if (state.objectives.some((objective) => objective.entryIds.includes(entry.id))) {
            return state;
        }
    }

    const errors = state.errors + 1;
    const attemptsLeft = GAME_CONFIG.maxAttempts - errors;

    if (attemptsLeft <= 0) {
        return { ...state, errors, status: 'lost', modal: { kind: 'lost' } };
    }

    return { ...state, errors, modal: { kind: 'wrong', attemptsLeft } };
};

const tapInExplore = (state: GameState, label: string): GameState => {
    const token = spriteToken(label);
    const entry = token ? getEntryForToken(token) : undefined;

    return entry ? { ...state, modal: { kind: 'ficha', entryId: entry.id, variant: 'explore' } } : state;
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
    switch (action.type) {
        case 'start':
            return startLevel(createInitialState('game'), 1, action.seed);

        case 'tap':
            if (state.modal) {
                return state;
            }
            return state.mode === 'game' ? tapInGame(state, action.label) : tapInExplore(state, action.label);

        case 'closeModal':
            // Los modales de fin de nivel, derrota y victoria solo se cierran con sus propios botones.
            if (state.modal?.kind === 'ficha' && state.modal.variant !== 'levelComplete') {
                return { ...state, modal: null };
            }
            return state.modal?.kind === 'wrong' ? { ...state, modal: null } : state;

        case 'nextLevel':
            if (state.status !== 'levelComplete') {
                return state;
            }
            return startLevel(state, state.level + 1, action.seed);

        case 'enterExplore':
            return createInitialState('explore');

        case 'idleReset':
            return createInitialState('idle');
    }
};

export interface CompanySummary {
    company: CompanyId;
    entryIds: string[];
}

// Empresas con algo encontrado en la partida y qué fichas, para el modal final.
export const companySummary = (state: GameState): CompanySummary[] =>
    COMPANY_IDS
        .map((company) => ({
            company,
            entryIds: state.foundEntryIds.filter((id) => getEntry(id)?.company === company),
        }))
        .filter((summary) => summary.entryIds.length > 0);

export const attemptsLeft = (state: GameState): number => GAME_CONFIG.maxAttempts - state.errors;
