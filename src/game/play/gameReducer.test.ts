import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config.ts';
import {
    buildObjectives,
    companySummary,
    createInitialState,
    gameReducer,
    LEVEL_COUNT,
    makeObjective,
    objectiveFound,
    type GameAction,
    type GameState,
} from './gameReducer.ts';

// Etiquetas inventadas con el mismo formato que el atlas; el reducer solo mira el token `ob_*`.
const sprite = (token: string, index = 0): string => `Zona__${token}__g${index}`;

const run = (state: GameState, ...actions: GameAction[]): GameState => actions.reduce(gameReducer, state);

const tap = (label: string): GameAction => ({ type: 'tap', label });
const close: GameAction = { type: 'closeModal' };

// Partida en curso con los objetivos que se le pasen, para no depender del azar.
const playing = (level: number, objectives = [makeObjective('type', 'papeleira', ['papeleira'])]): GameState => ({
    ...createInitialState('game'),
    level,
    objectives,
});

describe('elección de objetivos', () => {
    it('la misma semilla da los mismos objetivos', () => {
        expect(buildObjectives(1, 42)).toEqual(buildObjectives(1, 42));
        expect(buildObjectives(2, 7)).toEqual(buildObjectives(2, 7));
    });

    it('cada nivel pide lo que dice la configuración', () => {
        const level1 = buildObjectives(1, 1);
        const level2 = buildObjectives(2, 1);
        const level3 = buildObjectives(3, 1);

        expect(level1).toHaveLength(GAME_CONFIG.level1Types);
        expect(level1.every((objective) => objective.kind === 'type' && objective.entryIds.length === 1)).toBe(true);
        expect(level2).toHaveLength(GAME_CONFIG.level2Clues);
        expect(level2.every((objective) => objective.kind === 'clue')).toBe(true);
        expect(level3).toHaveLength(1);
        expect(level3[0].kind).toBe('company');
        expect(level3[0].total).toBeGreaterThanOrEqual(GAME_CONFIG.level3MinObjects);
    });

    it('el total respeta el tope por ficha', () => {
        expect(makeObjective('type', 'papeleira', ['papeleira']).total).toBe(GAME_CONFIG.maxPerTarget);
        expect(makeObjective('type', 'contedor', ['contedor']).total).toBe(1);
    });

    it('start empieza el nivel 1 en modo xogo', () => {
        const state = gameReducer(createInitialState(), { type: 'start', seed: 3 });

        expect(state.mode).toBe('game');
        expect(state.level).toBe(1);
        expect(state.objectives).toEqual(buildObjectives(1, 3));
    });
});

describe('toques en modo xogo', () => {
    it('un acierto suma, marca el sprite y abre la ficha', () => {
        const state = run(playing(1), tap(sprite('ob_papelera', 1)));

        expect(objectiveFound(state.objectives[0])).toBe(1);
        expect(state.countedSprites).toEqual([sprite('ob_papelera', 1)]);
        expect(state.modal).toEqual({ kind: 'ficha', entryId: 'papeleira', variant: 'game' });
    });

    it('volver a pulsar el mismo sprite no hace nada', () => {
        const once = run(playing(1), tap(sprite('ob_papelera', 1)), close);

        expect(gameReducer(once, tap(sprite('ob_papelera', 1)))).toBe(once);
    });

    it('con el tope cubierto, otra unidad de la misma ficha no hace nada', () => {
        const objectives = [
            makeObjective('type', 'papeleira', ['papeleira']),
            makeObjective('type', 'contedor', ['contedor']),
        ];
        const full = run(
            playing(1, objectives),
            tap(sprite('ob_papelera', 1)), close,
            tap(sprite('ob_papelera', 2)), close,
            tap(sprite('ob_papelera', 3)), close,
        );

        expect(objectiveFound(full.objectives[0])).toBe(GAME_CONFIG.maxPerTarget);
        expect(gameReducer(full, tap(sprite('ob_papelera', 4)))).toBe(full);
    });

    it('un acierto cuenta para todas las pistas que incluyen la ficha', () => {
        const objectives = [
            makeObjective('clue', 'froita', ['caixa_madeira', 'contedor', 'palet', 'carro']),
            makeObjective('clue', 'almacen', ['palet', 'carro', 'contedor']),
        ];
        const state = run(playing(2, objectives), tap(sprite('ob_pale_plastico')));

        expect(state.objectives.map(objectiveFound)).toEqual([1, 1]);
        expect(state.errors).toBe(0);
    });

    it('un señuelo es un error', () => {
        const state = run(playing(1), tap(sprite('ob_faro')));

        expect(state.errors).toBe(1);
        expect(state.modal).toEqual({ kind: 'wrong', attemptsLeft: GAME_CONFIG.maxAttempts - 1 });
    });

    it('una ficha que no es objetivo es un error', () => {
        const state = run(playing(1), tap(sprite('ob_ancla')));

        expect(state.errors).toBe(1);
        expect(state.modal?.kind).toBe('wrong');
    });

    it('un sprite sin token ob_ no hace nada', () => {
        const state = playing(1);

        expect(gameReducer(state, tap('Mar__kayaks__g892'))).toBe(state);
    });

    it('con un modal abierto los toques se ignoran', () => {
        const state = run(playing(1), tap(sprite('ob_faro')));

        expect(gameReducer(state, tap(sprite('ob_faro', 2)))).toBe(state);
    });

    it('se pierde justo al llegar a maxAttempts errores', () => {
        let state = playing(1);

        for (let error = 1; error < GAME_CONFIG.maxAttempts; error += 1) {
            state = run(state, tap(sprite('ob_faro', error)), close);
            expect(state.status).toBe('playing');
        }

        state = gameReducer(state, tap(sprite('ob_faro', 99)));

        expect(state.status).toBe('lost');
        expect(state.modal).toEqual({ kind: 'lost' });
        expect(gameReducer(state, close)).toBe(state);
        expect(gameReducer(state, tap(sprite('ob_papelera')))).toBe(state);
    });
});

describe('niveles y final', () => {
    it('el último acierto de un nivel abre la ficha de fin de nivel', () => {
        const state = run(playing(1, [makeObjective('type', 'contedor', ['contedor'])]), tap(sprite('ob_contenedor')));

        expect(state.status).toBe('levelComplete');
        expect(state.modal).toEqual({ kind: 'ficha', entryId: 'contedor', variant: 'levelComplete' });
        expect(gameReducer(state, close)).toBe(state);
    });

    it('nextLevel solo avanza con el nivel completo y conserva los errores', () => {
        const withError = run(
            playing(1, [makeObjective('type', 'contedor', ['contedor'])]),
            tap(sprite('ob_faro')), close,
        );

        expect(gameReducer(withError, { type: 'nextLevel', seed: 1 })).toBe(withError);

        const next = run(withError, tap(sprite('ob_contenedor')), { type: 'nextLevel', seed: 1 });

        expect(next.level).toBe(2);
        expect(next.status).toBe('playing');
        expect(next.errors).toBe(1);
        expect(next.countedSprites).toEqual([]);
        expect(next.objectives).toEqual(buildObjectives(2, 1));
        expect(next.modal).toBeNull();
    });

    it('completar el último nivel gana y resume por empresa', () => {
        const lastLevel: GameState = {
            ...playing(LEVEL_COUNT, [makeObjective('company', 'egalsa', ['caixa_madeira', 'malla'])]),
            errors: 1,
            foundEntryIds: ['papeleira', 'contedor'],
        };
        const won = run(
            lastLevel,
            tap(sprite('ob_caja_madera')), close,
            tap(sprite('ob_malla_limones')), close,
            tap(sprite('ob_malla_naranjas')),
        );

        expect(won.status).toBe('won');
        expect(won.modal).toEqual({ kind: 'won', errors: 1 });
        expect(companySummary(won)).toEqual([
            { company: 'rotogal', entryIds: ['contedor'] },
            { company: 'egalsa', entryIds: ['caixa_madeira', 'malla'] },
            { company: 'oziona', entryIds: ['papeleira'] },
        ]);
    });
});

describe('modos', () => {
    it('en exploración un objeto con ficha abre la ficha y un señuelo no hace nada', () => {
        const explore = createInitialState('explore');

        expect(gameReducer(explore, tap(sprite('ob_papelera'))).modal)
            .toEqual({ kind: 'ficha', entryId: 'papeleira', variant: 'explore' });
        expect(gameReducer(explore, tap(sprite('ob_faro')))).toBe(explore);
    });

    it('en idle se comporta como exploración', () => {
        expect(gameReducer(createInitialState('idle'), tap(sprite('ob_ancla'))).modal)
            .toEqual({ kind: 'ficha', entryId: 'ancora', variant: 'explore' });
    });

    it('pasar a exploración, reiniciar y la inactividad borran la partida', () => {
        const inGame = run(playing(2), tap(sprite('ob_faro')), close);

        expect(gameReducer(inGame, { type: 'enterExplore' })).toEqual(createInitialState('explore'));
        expect(gameReducer(inGame, { type: 'idleReset' })).toEqual(createInitialState('idle'));

        const restarted = gameReducer(inGame, { type: 'start', seed: 9 });

        expect(restarted.errors).toBe(0);
        expect(restarted.level).toBe(1);
    });
});
