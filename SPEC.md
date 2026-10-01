# Spec: Mecánicas de xogo (modo xogo e modo exploración)

Idea de origen: `docs/ideas/mecanicas-xogo.md`. Contenidos: `docs/content/objetos.md` y `docs/content/pistas.md`.

## Objective

Es un kiosko en un stand o feria, con pantalla compartida y sesiones de 3 a 5 minutos. Quien juega tiene que irse sabiendo **qué fabrica cada empresa** (Rotogal, Egalsa, JJ Chicolino y Oziona) después de haberlo descubierto en el mapa.

Hay dos modos sobre el mismo mapa:

- **Modo xogo.** Tiene 3 niveles con intentos compartidos:
  1. **Tipos explícitos:** "Atopa 3 papeleiras", "1 contedor"…
  2. **Pistas:** "Busca algo para levar froita dun sitio a outro" → todos los objetos que cumplen la pista.
  3. **Una empresa:** todos los objetos que fabrica, por ejemplo Rotogal.
- **Modo exploración.** Cualquier objeto con ficha muestra su ficha, sin límites.

En todas las fichas aparece "Fabricado por" con una etiqueta del color de la empresa. El juego termina con un resumen por empresa.

### Modelo de juego

**Objetos y fichas.** Cada sprite con `ob_*` en su etiqueta (atlas) está asociado como mucho a una **ficha** del catálogo, mediante su token `ob_*` exacto (`normalizeTargetId`, igual que hoy). Los sprites con un token sin ficha son **señuelos**.

**Objetivo.** Todos los niveles comparten el mismo modelo:

```
Objective { id, label, entryIds[], foundByEntry: Record<entryId, number>, total }
cap(entry) = min(nº de sprites de la ficha, maxPerTarget)
total      = Σ cap(entry) para entry ∈ entryIds
```

| Nivel | Objetivos | Cómo se eligen | Texto en la HUD |
|---|---|---|---|
| 1 | `level1Types` objetivos de una sola ficha | Al azar entre las fichas con sprites | `1/3 papeleiras` (con `found/total` y el plural; singular si el total es 1) |
| 2 | `level2Clues` objetivos de pista | Al azar entre las pistas del catálogo | El texto de la pista y `2/5 obxectos` |
| 3 | 1 objetivo con todas las fichas de una empresa | Al azar entre las empresas con `total ≥ level3MinObjects` | Etiqueta de la empresa y `3/8 obxectos` |

**Cómo se resuelve un toque** sobre un sprite `S` con ficha `F`, en modo xogo:

1. Si `S` ya se contó en este nivel, no pasa nada.
2. Si hay objetivos que incluyen `F` y en los que `foundByEntry[F] < cap(F)`, el acierto **cuenta para todos ellos** (las pistas pueden solaparse). `S` queda marcado y suena `success`.
   - Si con eso se completan todos los objetivos y es el nivel 3, sale el **modal final**.
   - Si se completan todos y no es el nivel 3, sale la **ficha de fin de nivel**.
   - Si no, sale la **ficha**.
3. Si hay objetivos que incluyen `F` pero ya están llenos para `F`, no pasa nada: no hay modal ni penalización.
4. En cualquier otro caso es un **error**, y cubre tanto los señuelos como las fichas que no son objetivo. Se suma `errors` y suena `error`. Si quedan intentos (`maxAttempts - errors > 0`), sale el **modal de incorrecto**; si no, el **modal de derrota**.

Un toque en el vacío no hace nada. **Toque** quiere decir `pointerup` con menos de `tapMaxMovePx` de movimiento desde el `pointerdown`, para que arrastrar el mapa no cuente como error.

Los objetivos empiezan de cero en cada nivel. `errors` se mantiene durante toda la partida.

### Modos y HUD (`div#hud`)

El modo puede ser `idle` (no se ha empezado nada), `game` o `explore`. En `idle` el mapa se comporta como en exploración.

| Pestaña | `idle` | `game` | `explore` |
|---|---|---|---|
| **Inicio** | Texto ("Explora as nosas instalacións e descubre o que fabrican as nosas empresas. Pulsa «Comecemos!» para xogar ou vai a Exploración para percorrer o mapa ao teu aire.") y botón "Comecemos!", que empieza el nivel 1 | Botones "Continuar xogando" (lleva a la pestaña Xogo) y "Reiniciar xogo" (pide confirmación A y, si se acepta, empieza el nivel 1) | Igual que en `idle` |
| **Xogo** (etiqueta "Xogo N/3" en `game`, "Xogo" en los demás modos) | Empieza el nivel 1 | Muestra los objetivos del nivel actual | Pide confirmación B y, si se acepta, empieza el nivel 1 |
| **Exploración** ("Podes explorar o escenario e clicar nos obxectos para aprender sobre eles sen límite. Esta información virache moi ben para os xogos ;)") | Pasa a `explore` | Pide confirmación A y, si se acepta, pasa a `explore` y borra la partida | Muestra el texto |
| **⚙ Axustes** | Sliders "Volume do son ambiente", "Volume dos efectos de son" y "Volume da música" (este último no hace nada) | Igual | Igual |

- **Confirmación A:** "Seguro? Isto fará que perdas todos os teus avances", con los botones "Si" y "Non".
- **Confirmación B:** "Seguro? Isto fará que comeces unha nova partida", con los botones "Si" y "Non".

Con "Non" se cierra el modal y no cambia nada.

### Modales

| Modal | Contenido | Botones |
|---|---|---|
| **Ficha** (xogo) | Titular propio de la ficha (si no tiene, "Atopáchelo!") · nombre en singular · "Sabías que..." · texto · "Fabricado por" y etiqueta de la empresa | "Continuar xogando" |
| **Ficha de fin de nivel** | Igual, pero el titular es "Completaches o nivel!" | "Pasar ao nivel N" (empieza el nivel N y abre la pestaña Xogo) |
| **Ficha** (exploración o `idle`) | Igual, pero sin titular | "Continuar explorando" |
| **Incorrecto** | "Obxecto incorrecto!" · "Quédanche N intentos" ("Quédache 1 intento" si queda uno) | "Continuar xogando" |
| **Derrota** | "Perdiches!" · "Esgotaches todos os intentos" | "Volver a xogar" (nivel 1) · "Explorar o mapa" (`explore`) |
| **Final** | "Completaches o xogo con N erros!" ("1 erro" si fue uno) · "Xa sabes máis da nosa empresa ca nós :)" · resumen con la etiqueta de cada empresa y las fichas encontradas de cada una durante la partida | "Volver a xogar" · "Explorar o mapa" |
| **Inactividad** | "Segues aí?" y cuenta atrás de `idleWarningSeconds` | "Sigo aquí" |

Mientras hay un modal abierto, el mapa no recibe toques.

### Señuelos según el modo
- **`game`:** se pueden pulsar, tienen hover (sonido y muelle) y cuentan como error.
- **`explore` / `idle`:** no se pueden pulsar: no tienen cursor de mano, ni hover, ni clic.

### Inactividad (kiosko)
Si pasan `idleSeconds` sin eventos de puntero o teclado, y hay algo que reiniciar (modo distinto de `idle`, un modal abierto o la cámara fuera de la vista inicial), sale el modal de inactividad. Si la cuenta atrás termina, se cierran los modales, el modo pasa a `idle`, se borra la partida, la HUD vuelve a Inicio y la cámara vuelve a la vista inicial. **Los volúmenes no se tocan.**

### Audio
- Cada slider va de 0 a 100 y empieza en 100. El volumen final es el volumen base de hoy multiplicado por el slider: `praia` 0.5 y `hover_*` 0.25.
- **Ambiente:** `praia`.
- **Efectos:** `hover_*`, `click`, `success` y `error`, tanto los que suenan en Phaser como el `new Audio()` de la HUD.
- **Música:** guarda su valor, pero no está conectado a nada.
- Los valores se guardan en `localStorage` (`boiro.audio`) con try/catch. Si no se pueden leer, se usan los valores por defecto.

### Contenido
- **Catálogo:** 14 fichas jugables, cada una con sus sprites:

  | Ficha | Sprites | Empresa |
  |---|---|---|
  | Contedores | `ob_contenedor` | Rotogal |
  | Carro cutter | `ob_carro` | Rotogal |
  | Pallets | `ob_pale_plastico`, `ob_pale_porex` | Rotogal |
  | Barreiras | `ob_newjersey` | Rotogal |
  | Caixas de madeira | `ob_caja_madera` | Egalsa |
  | Mallas | `ob_malla_limones`, `ob_malla_naranjas` | Egalsa |
  | Sacos | `ob_saco_malla` | JJ Chicolino |
  | Boias | `ob_boya`, `ob_boya_amarilla` | JJ Chicolino |
  | Áncoras | `ob_ancla` | JJ Chicolino |
  | Corda de cultivo | `ob_cuerda` | JJ Chicolino |
  | Bancos | `ob_banco_jardinera`, `ob_banco_ola` | Oziona |
  | Papeleiras | `ob_papelera` | Oziona |
  | Fontes | `ob_fuente` | Oziona |
  | Parque canino | `ob_canodromo` | Oziona |

  Las fichas de `objetos.md` que no tienen sprite se quedan fuera hasta que lo tengan.
- **Limpieza del texto:** la exclamación inicial pasa al campo `headline` (por ejemplo "Que crack! 🎉"), se quita "Atopáchelo!" y la pregunta "Sabías que…?" se convierte en una afirmación. No se inventa contenido nuevo.
- **Pistas:** de `pistas.md` quedan las que se pueden jugar con la escena: *froita*, *almacén* y *mar* (solo con las boias). Las demás quedan comentadas como pendientes.
- **Colores de empresa** (de `escena.svg`): Rotogal `#ea580c` · Egalsa `#2e6777` · JJ Chicolino `#0369a1` · Oziona `#65a30d`.

## Tech Stack
React 19 · Phaser 4.0.0 · TypeScript ~5.7 · Vite 6 · Tailwind 4. **Nuevo:** Vitest como devDependency, la versión compatible con Vite 6.

## Commands
```
Dev:        npm run dev-nolog
Build:      npm run build-nolog
Typecheck:  ./node_modules/.bin/tsc --noEmit -p .
Test:       npm test              # nuevo script: "test": "vitest run"
Test watch: npx vitest
```
ESLint no funciona (`.eslintrc.cjs` con ESLint 9) y queda fuera de este trabajo.

## Project Structure
```
src/game/config.ts                 → GAME_CONFIG: todos los números ajustables
src/game/content/catalog.ts        → empresas (nombre, color), fichas, pistas
src/game/content/texts.ts          → textos de la interfaz en gallego y plurales ("1 erro" / "N erros")
src/game/content/catalog.test.ts   → integridad del catálogo frente a atlas-index.json
src/game/play/gameReducer.ts       → lógica pura: estado + acciones (sustituye a GameState.ts)
src/game/play/gameReducer.test.ts  → niveles, toques, solapes, tope, intentos, final
src/game/audioSettings.ts          → volúmenes, localStorage y suscripción
src/game/scenes/GameScene.ts       → toque frente a arrastre, señuelos según modo, volúmenes, reinicio de cámara
src/components/Hud.tsx             → pestañas (sustituye a GameModal.tsx)
src/components/FichaModal.tsx      → ficha de objeto, en todas sus variantes
src/components/MessageModal.tsx    → incorrecto, derrota, final, confirmación e inactividad
src/App.tsx                        → useReducer, puente con EventBus y temporizador de inactividad
```
Se eliminan `ObjectFoundModal.tsx` y `GameState.ts`.

**EventBus**

| Evento | Dirección | Carga |
|---|---|---|
| `object-clicked` | Phaser → React | `label` (solo cuando es un toque) |
| `mode-changed` | React → Phaser | `'idle' \| 'game' \| 'explore'` |
| `modal-open-changed` | React → Phaser | `boolean` |
| `reset-camera` | React → Phaser | (sin carga) |
| `user-activity` | Phaser → React | (sin carga) |

## Code Style
Lógica en TypeScript con el estilo de `GameState.ts`: 4 espacios, funciones flecha en `const`, tipos explícitos, comillas simples y punto y coma. Los identificadores van en inglés, los textos para el jugador en gallego (solo en `texts.ts` y `catalog.ts`) y los comentarios en español. Cada fichero mantiene sus finales de línea.

```ts
export const GAME_CONFIG = {
    level1Types: 2,
    level2Clues: 2,
    maxPerTarget: 3,
    maxAttempts: 5,
    level3MinObjects: 3,
    idleSeconds: 90,
    idleWarningSeconds: 15,
    tapMaxMovePx: 10,
} as const;

// El acierto cuenta para todos los objetivos que aún admiten esa ficha (las pistas pueden solaparse).
const objectivesAccepting = (objectives: Objective[], entryId: string): Objective[] =>
    objectives.filter((objective) =>
        objective.entryIds.includes(entryId) && objective.foundByEntry[entryId] < capFor(entryId));
```

El reducer es puro: el azar llega como semilla en la acción (`{ type: 'start', seed }`) y se usa con un PRNG con semilla, así que los tests son deterministas y el doble render de StrictMode no cambia nada. Los modales también forman parte del estado (`state.modal`), y React solo los muestra.

## Testing Strategy
- **Vitest con el entorno `node`.** Los tests van junto al código (`*.test.ts`).
- **`gameReducer.test.ts`:**
  - Elección de objetivos por nivel con el azar fijado.
  - El tope por ficha.
  - Un acierto con solape cuenta para 2 pistas.
  - Volver a pulsar el mismo sprite no hace nada.
  - Pulsar una ficha que ya está llena no hace nada.
  - Un señuelo cuenta como error, y una ficha que no es objetivo también.
  - Los intentos se arrastran entre niveles.
  - La derrota llega exactamente al llegar a `maxAttempts`.
  - Fin de nivel → nivel siguiente → final, con su resumen por empresa.
  - Reiniciar y pasar a exploración borran la partida.
- **`catalog.test.ts`:**
  - Cada token `ob_*` de las fichas existe en `atlas-index.json`.
  - Ningún token está en dos fichas.
  - Cada pista apunta a fichas que existen y su `total ≥ 2`.
  - Cada empresa tiene color.
  - `level2Clues ≤` el número de pistas.
  - Al menos una empresa cumple `level3MinObjects`.
- **Manual en el navegador** (`npm run dev-nolog`): recorrido completo ganando, recorrido perdiendo, arrastre sobre un señuelo sin error, confirmaciones, inactividad con reinicio de cámara y sliders.
- La HUD y Phaser no tienen tests automáticos.

## Boundaries
- **Always:**
  - `tsc` y `npm test` en verde antes de cada commit.
  - Los textos para el jugador solo en `texts.ts` y `catalog.ts`.
  - Los números solo en `GAME_CONFIG`.
  - Commits en español con el estilo del historial ("Añadimos…").
- **Ask first:**
  - Cualquier dependencia aparte de Vitest.
  - Redactar contenido nuevo o cambiar datos de las fichas, más allá de la limpieza descrita.
  - Tocar `SpriteLod` / `HdBlobStore` o la carga HD.
  - Cambiar `StartScreen`.
  - Arreglar ESLint.
- **Never:**
  - Inventar datos de empresas o productos.
  - Modificar `escena.svg` o el atlas.
  - Hacer commit o push sin que se pida.
  - Guardar el estado de la partida en `localStorage`.

## Success Criteria
- [ ] Una partida con los valores por defecto se completa de principio a fin. Los contadores muestran `found/total` y el total respeta el tope.
- [ ] En el nivel 2, un toque en un palet suma a la vez en *froita* y en *almacén* si ambas pistas están activas.
- [ ] Con 2 errores en el nivel 1, el nivel 2 empieza con 3 intentos. Al 5.º error sale "Perdiches!".
- [ ] Arrastrar el mapa empezando sobre un señuelo no cuenta como error.
- [ ] En exploración, los señuelos no tienen hover ni cursor de mano. En el modo xogo, sí.
- [ ] El modal final muestra el número correcto de errores, en singular o plural, y el resumen de las 4 empresas, mostrando solo las que tienen algo encontrado.
- [ ] Las tres pestañas y Axustes se comportan según la tabla de modos, con sus confirmaciones.
- [ ] Tras `idleSeconds + idleWarningSeconds` sin actividad, todo vuelve a Inicio y a la cámara inicial, y los volúmenes se mantienen tras recargar.
- [ ] `npm test` y `tsc` pasan, y `npm run build-nolog` compila.

## Open Questions
- **Pistas sin objetos suficientes** (*tarde na auga*, *cordas*, *manter no sitio*): quedan comentadas en el catálogo hasta que haya sprites o una reescritura tuya.
