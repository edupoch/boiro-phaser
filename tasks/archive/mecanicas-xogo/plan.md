# Plan de implementación: mecánicas de xogo

Spec: `SPEC.md` · Idea: `docs/ideas/mecanicas-xogo.md`

## Overview
Hay que sustituir el prototipo actual de búsqueda (`GameState.ts`, `ObjectFoundModal.tsx` y la pestaña "Xogo 1") por:

- el modo xogo de 3 niveles con intentos compartidos;
- el modo exploración;
- la HUD con 4 pestañas y confirmaciones;
- los ajustes de volumen;
- el reinicio del kiosko por inactividad.

Primero van los cimientos que se pueden probar sin navegador: el catálogo y el reducer con tests. Después se monta encima la interfaz, por partes que se pueden jugar.

## Architecture Decisions
- **El juego es un reducer puro (`src/game/play/gameReducer.ts`)** que guarda todo el estado del juego: modo, nivel, objetivos, sprites ya contados, errores, fichas encontradas **y el modal de juego abierto** (`state.modal`: ficha, incorrecto, derrota o final). Las confirmaciones y el aviso de inactividad no cambian las reglas, así que son estado local de React. React solo pinta `state` y hace `dispatch`. Los efectos (sonidos y avisos a Phaser) se derivan de los cambios de estado en `App.tsx`. Así toda la lógica de las reglas se puede probar con tests y desaparece el patrón actual de emitir eventos dentro de un `setState` (`App.tsx:31-41`).
- **El azar entra como semilla en la acción** (`start`, `nextLevel`) y se usa con un PRNG con semilla (mulberry32, unas 10 líneas, sin dependencia). Con esto el reducer es determinista en los tests y no importa que StrictMode lo ejecute dos veces.
- **Los tres niveles comparten el mismo modelo de objetivo** (`entryIds`, `foundByEntry`, `total`). Solo cambia cómo se eligen los objetivos y cómo los pinta la HUD (`kind: 'type' | 'clue' | 'company'`). Una sola función, `resolveTap`, resuelve los toques de todos los niveles.
- **El catálogo es TypeScript, no se lee de Markdown en tiempo de ejecución.** `docs/content/*.md` sigue siendo la fuente de redacción, y el catálogo se actualiza a mano. Un test comprueba el catálogo frente a `atlas-index.json`.
- **Phaser sabe muy poco del juego.** Emite `object-clicked` (solo cuando es un toque) y `user-activity`, y escucha `mode-changed` (para activar o desactivar los señuelos) y `reset-camera`. Para saber qué tokens tienen ficha importa el catálogo, que son datos puros.
- **El audio va en un módulo aparte (`src/game/audioSettings.ts`).** Tiene `get`, `set` y `subscribe`, y guarda en `localStorage` con try/catch. Phaser y la HUD leen de ahí, y no pasa por el reducer porque no es estado de partida y el reinicio no lo toca.
- **Bloqueo del mapa con un modal abierto:** el backdrop es `fixed` a pantalla completa y ya tapa el canvas. El evento `modal-open-changed` del spec solo se añade si la comprobación manual de T4 demuestra que hace falta.

## Dependency graph

```
T1 Catálogo + config + textos + Vitest
 └── T2 gameReducer (reglas completas, con tests)
      └── T4 Recorrido de acierto jugable (App + Hud + FichaModal) ◄── T3 Toque y arrastre (GameScene)
           ├── T5 Errores, derrota y final (MessageModal)
           │    └── T6 Modos, pestañas y confirmaciones (+ señuelos según modo en GameScene)
           │         └── T8 Reinicio por inactividad (+ reset-camera)
           └── T7 Audio y Axustes
```

T3 no depende de nada y puede hacerse en paralelo con T1 y T2. T7 solo necesita que exista `Hud.tsx` (T4), así que puede ir en paralelo con T5 y T6.

## Task List

### Fase 1: Cimientos (sin interfaz)

#### T1: Catálogo, config, textos y Vitest
**Descripción:** Se añade Vitest con el script `npm test`. Se crean `GAME_CONFIG`, el catálogo (4 empresas con color, 14 fichas limpias según el spec y las 3 pistas jugables, con las demás comentadas) y `texts.ts`, con los textos de la interfaz y los plurales.

**Acceptance criteria:**
- [ ] Las 14 fichas de la tabla del spec existen, con `name`, `plural`, `company`, `headline`, `text` y `spriteTokens`. Ningún texto contiene "Sabías que" ni "Atopáchelo".
- [ ] `catalog.test.ts` cubre las comprobaciones de integridad del spec: los tokens existen en el atlas, no hay tokens repetidos, cada pista tiene un total ≥ 2, cada empresa tiene color y hay una empresa que cumple `level3MinObjects`.
- [ ] `plural('erro', 1)` devuelve "1 erro" y `plural('erro', 0)` devuelve "0 erros" (test).

**Verification:** `npm test` · `tsc --noEmit` · revisión humana de los textos limpios del catálogo.

**Dependencies:** ninguna.

**Files:** `package.json`, `src/game/config.ts`, `src/game/content/catalog.ts`, `src/game/content/texts.ts`, `src/game/content/catalog.test.ts`.

**Scope:** M.

#### T2: `gameReducer` con las reglas completas
**Descripción:** Reducer puro con el estado de `SPEC.md` y las acciones `start`, `tap`, `closeModal`, `nextLevel`, `enterExplore`, `reset` y `idleReset`. Incluye el PRNG con semilla, la elección de objetivos por nivel, `resolveTap` (los 4 casos del spec) y el resumen por empresa.

**Acceptance criteria:**
- [ ] Los casos de la sección *Testing Strategy* del spec, para el reducer, pasan.
- [ ] La misma semilla da los mismos objetivos. El reducer no usa `Math.random`, `Date` ni E/S.
- [ ] En `explore` o `idle`, un toque sobre una ficha abre `modal: { kind: 'ficha', variant: 'explore' }`, y uno sobre un señuelo no hace nada.

**Verification:** `npm test` · `tsc --noEmit`.

**Dependencies:** T1.

**Files:** `src/game/play/gameReducer.ts`, `src/game/play/rng.ts`, `src/game/play/gameReducer.test.ts`.

**Scope:** M.

#### T3: Toque y arrastre en `GameScene`
**Descripción:** `object-clicked` pasa de `pointerdown` a `pointerup` y solo se emite si `pointer.getDistance() < tapMaxMovePx`.

**Acceptance criteria:**
- [ ] Un clic sobre un objeto emite `object-clicked` una vez.
- [ ] Arrastrar empezando sobre un objeto mueve el mapa y no emite nada.
- [ ] Hover y muelle siguen igual.

**Verification:** manual en `npm run dev-nolog`, con el ratón y con la emulación táctil de DevTools · `tsc --noEmit`.

**Dependencies:** ninguna (usa `GAME_CONFIG` si T1 ya está, y si no, una constante local que luego se mueve).

**Files:** `src/game/scenes/GameScene.ts`.

**Scope:** S.

### Checkpoint 1: cimientos
- [ ] `npm test` y `tsc` en verde.
- [ ] Revisión humana de los textos del catálogo (la limpieza de "Sabías que" y los titulares).

### Fase 2: Juego jugable

#### T4: Recorrido de acierto de los 3 niveles
**Descripción:** `App.tsx` pasa a usar `useReducer(gameReducer)` y conecta `object-clicked` con `tap`. `GameModal.tsx` se convierte en `Hud.tsx`: las pestañas Inicio ("Comecemos!" hace `start`) y "Xogo N/3", y los objetivos de los 3 tipos (tipo con plural, pista y etiqueta de empresa). Se crea `FichaModal.tsx` con las variantes de juego y de fin de nivel, y suena `success`. Se borran `GameState.ts` y `ObjectFoundModal.tsx`.

**Acceptance criteria:**
- [ ] Se pueden completar los niveles 1→2→3 solo acertando. Los contadores muestran `found/total` con el tope y la pestaña dice "Xogo N/3".
- [ ] La ficha muestra el titular propio, el nombre, "Sabías que...", el texto y la etiqueta de la empresa con su color. En el último acierto del nivel sale "Completaches o nivel!" y "Pasar ao nivel N".
- [ ] Con un modal abierto, el mapa no responde a toques. Si responde, se añade `modal-open-changed`.

**Verification:** `npm test` · `tsc` · `npm run build-nolog` · recorrido manual de los 3 niveles.

**Dependencies:** T2, T3.

**Files:** `src/App.tsx`, `src/components/Hud.tsx` (antes `GameModal.tsx`), `src/components/FichaModal.tsx`, se eliminan `src/game/GameState.ts` y `src/components/ObjectFoundModal.tsx` (+ su CSS si nadie más lo usa).

**Scope:** M.

#### T5: Errores, derrota y final
**Descripción:** `MessageModal.tsx`, un modal genérico con título, cuerpo y botones, se usa para los modales de incorrecto (con el singular y plural de los intentos), derrota ("Volver a xogar" y "Explorar o mapa") y final (errores y resumen por empresa con sus etiquetas). Suena `error`.

**Acceptance criteria:**
- [ ] Un señuelo o una ficha que no es objetivo muestran "Obxecto incorrecto!" con los intentos que quedan. Al llegar a `maxAttempts` errores sale "Perdiches!".
- [ ] El final muestra "Completaches o xogo con N erros!" ("1 erro" si fue uno) y las empresas en las que se encontró algo.
- [ ] "Volver a xogar" empieza el nivel 1 con los intentos al completo. "Explorar o mapa" pasa a `explore`.

**Verification:** `npm test` · `tsc` · manual: perder a propósito y ganar con exactamente 1 error.

**Dependencies:** T4.

**Files:** `src/components/MessageModal.tsx`, `src/App.tsx`, `src/components/Hud.tsx` (si el resumen reutiliza la etiqueta de empresa, se extrae a `src/components/CompanyChip.tsx`).

**Scope:** M.

#### T6: Modos, pestañas y confirmaciones
**Descripción:** La tabla de modos del spec completa. Incluye:
- Inicio con "Continuar xogando" y "Reiniciar xogo".
- La pestaña Exploración con su texto.
- Las confirmaciones A y B.
- La ficha de exploración con "Continuar explorando".
- En `GameScene`, escuchar `mode-changed` para activar o desactivar los señuelos: con `disableInteractive` y `setInteractive`, que también apaga el hover.

**Acceptance criteria:**
- [ ] Cada celda de la tabla de modos del spec se comporta como se describe, incluido "Non", que no cambia nada.
- [ ] En `explore` e `idle`, los señuelos no tienen cursor de mano, ni hover, ni clic. En `game`, sí.
- [ ] En `idle`, los objetos con ficha muestran la ficha de exploración.

**Verification:** `npm test` · `tsc` · manual recorriendo la tabla de modos celda a celda.

**Dependencies:** T5 (la confirmación usa `MessageModal`).

**Files:** `src/components/Hud.tsx`, `src/components/FichaModal.tsx`, `src/App.tsx`, `src/game/scenes/GameScene.ts`.

**Scope:** M.

### Checkpoint 2: juego completo
- [ ] Se cumplen los criterios de éxito del spec, excepto los de audio e inactividad.
- [ ] `npm test`, `tsc` y `build-nolog` en verde.
- [ ] Partida de prueba humana con los valores por defecto, cronometrada (supuesto: 3–5 min).

### Fase 3: Kiosko

#### T7: Audio y Axustes
**Descripción:** `audioSettings.ts` con 3 volúmenes de 0 a 1 que empiezan en 1, guardados en `localStorage` (`boiro.audio`) con try/catch. La pestaña ⚙ tiene 3 sliders. En `GameScene`, `praia` usa `0.5 × ambiente` y se actualiza en vivo, y los efectos usan `base × efectos`. El sonido de clic de la HUD usa `efectos`.

**Acceptance criteria:**
- [ ] Mover "Volume do son ambiente" cambia `praia` en el momento. Con "Volume dos efectos de son" a 0 no suena ni el hover, ni el clic, ni el acierto, ni el error.
- [ ] Los valores se mantienen al recargar, y la página funciona aunque `localStorage` lance una excepción.
- [ ] "Volume da música" se guarda, pero no está conectado a nada.

**Verification:** `tsc` · manual en Chrome y Firefox.

**Dependencies:** T4.

**Files:** `src/game/audioSettings.ts`, `src/components/Hud.tsx`, `src/game/scenes/GameScene.ts`, `src/App.tsx` (los sonidos de acierto y error, si suenan desde React).

**Scope:** M.

#### T8: Reinicio por inactividad
**Descripción:** Un temporizador en `App.tsx` que se reinicia con la actividad del DOM y con el evento `user-activity` de Phaser. Muestra "Segues aí?" con su cuenta atrás y, al terminar, hace `idleReset`, vuelve a Inicio y emite `reset-camera`. `GameScene` guarda el zoom y el scroll iniciales y los restaura.

**Acceptance criteria:**
- [ ] Después de `idleSeconds` sin actividad sale el aviso, pero solo si hay algo que reiniciar. Con "Sigo aquí" no se pierde nada.
- [ ] Si la cuenta atrás termina, el modo pasa a `idle`, se cierran los modales, la HUD vuelve a Inicio y la cámara a la vista inicial. Los volúmenes no cambian.
- [ ] Mover el mapa, hacer zoom o pulsar cuenta como actividad.

**Verification:** `npm test` (`idleReset` en el reducer) · `tsc` · manual con `idleSeconds` bajado temporalmente a 10.

**Dependencies:** T6.

**Files:** `src/App.tsx`, `src/components/MessageModal.tsx` (si hace falta la cuenta atrás), `src/game/scenes/GameScene.ts`.

**Scope:** M.

### Checkpoint 3: completo
- [ ] Se cumplen todos los criterios de éxito de `SPEC.md`.
- [ ] `npm test`, `tsc` y `build-nolog` en verde.
- [ ] Prueba en el Mac de referencia (Firefox), para comprobar que los modales y la HUD no afectan al rendimiento del mapa. Si se puede, también en el kiosko.
- [ ] Se actualizan `SPEC.md` y `docs/ideas/mecanicas-xogo.md` con las decisiones que hayan cambiado.

## Risks and Mitigations
| Riesgo | Impacto | Mitigación |
|---|---|---|
| La limpieza de los textos cambia el tono o el significado | Medio | No se inventa nada: solo se separa el titular y la pregunta pasa a afirmación. Revisión humana en el Checkpoint 1. |
| `disableInteractive` y `setInteractive` en Containers de varios chunks pierden el hit area | Medio | Se guarda la configuración del hit area al crear el objeto y se reutiliza. Se prueba con un señuelo que tenga varios chunks. |
| En pantalla táctil, `pointer.getDistance()` con un umbral de 10 px es demasiado estricto o demasiado laxo | Bajo | El valor está en `GAME_CONFIG`. Se prueba en el kiosko. |
| Los efectos de React (sonidos y avisos a Phaser) se disparan dos veces en StrictMode | Bajo | Los efectos se derivan de cambios de estado en un `useEffect` comparando con el valor anterior, nunca dentro del reducer. |
| Pocas pistas jugables (3) con `level2Clues = 2` hacen el nivel 2 repetitivo | Bajo | El problema es de contenido, no de código. Las pistas nuevas se añaden al catálogo y el test valida su total. |

## Open Questions
Ninguna que bloquee. Las pistas y fichas nuevas son de contenido y entran en el catálogo en cualquier momento.
