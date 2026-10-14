# Plan de implementación: oleaje en la orilla

Idea: `docs/ideas/oleaje-orilla.md` · Plan anterior: `tasks/archive/mecanicas-xogo-plan.md` (su checkpoint 3 en el Mac sigue pendiente)

## Overview
El agua azul (`Fondo__orilla__use22`) crece y encoge con calma, con una curva asimétrica que sube más rápido de lo que se retira. La espuma blanca (`Fondo__mar__path135`) repite la misma ola un cuarto de ciclo después, así que al retirarse el agua queda un momento la franja de arena mojada. Cada capa se escala (siempre ≥ 1) desde un pivote situado sobre la diagonal del muelle, para que ningún borde se abra sin tocar el SVG. No se gasta VRAM: solo cambia la transformación.

## Architecture Decisions
- **La curva es una función pura en `src/game/oleaje.ts`.** `oleaje(t)` devuelve la escala para el tiempo `t` en ms y se prueba con Vitest, como `gameReducer`. La forma base `w(fase)` vale 0 al principio y al final de cada ciclo, y la escala es `1 + A·w`. Así la escala nunca baja de 1, y multiplicar cada ciclo por una amplitud distinta (T3) no produce saltos.
- **Un solo reloj en `GameScene.update()`, sin tweens.** El agua usa `oleaje(time)` y la espuma `oleaje(time − RETRASO)`. Con eso el desfase es exacto y, cuando la amplitud varíe por ciclo, la espuma repite la ola concreta del agua. Los tweens de Phaser no lo garantizan.
- **Pivote fijo en coordenadas del mundo, dentro del agua: (2426, 3500).** Al escalar (≥ 1), todos los bordes se alejan del pivote: la orilla avanza hacia la arena casi en perpendicular, la diagonal del muelle se mete bajo el muro y los bordes inferior e izquierdo salen del mundo. *(Cambiado en T1: con el pivote previsto, (6815, 3680) sobre la diagonal, no se abrían rendijas, pero la punta del agua se deslizaba por la diagonal y su contorno asomaba sobre la arena pasada la esquina del muro. El pivote nuevo está justo debajo de esa esquina, que así sube bajo el muro.)* Para cada objeto se calcula el origen normalizado `(pivote − esquina) / tamaño`, se aplica con `setPivot` (vale para Image y para Container, y `SpriteLod.getOrigin` ya lo lee para los chunks HD) y se coloca el objeto en el pivote.
- **Escala relativa a la de reposo.** Los `hoyo_*` son `Image` con `setDisplaySize`, así que su escala en reposo no es 1. Se guarda `scaleX/scaleY` en reposo y cada frame se aplica `reposo · s`. `SpriteLod.syncContainer` ya divide por `baseScaleX`, así que la HD sigue sola. Ninguna de las cuatro capas tiene HD de un solo chunk (que cambiaría la textura y la escala).
- **Grupos de capas:** al **agua** van `orilla` y `hoyo_mar` (manchas blancas encima del agua). A la **espuma** van `mar` y `hoyo_orilla` (charcos azules dentro de la franja blanca).
- **Ajuste en vivo.** Las constantes (`PERIODO_MS`, `AMPLITUD`, `RETRASO_MS`, `PIVOTE`) están en un objeto exportado de `oleaje.ts`, que se expone en `window.__oleaje` igual que `__spriteLod`. Así se pueden ajustar en el Mac sin recompilar.

## Dependency graph

```
T1 oleaje(t) + el agua respira (orilla, hoyo_mar)   ← valida los riesgos: HD, bordes, fps, amplitud
 └── Checkpoint 1 (Mac)
      └── T2 La espuma sigue con retraso (mar, hoyo_orilla)
           └── T3 Cada ola distinta (amplitud por ciclo)
                └── Checkpoint 2 (Mac + kiosko)
```

Todo es secuencial: cada tarea se apoya en la curva y el bucle de la anterior.

## Task List

### Fase 1: El agua respira

## Task 1: `oleaje(t)` y escalado del agua desde el pivote

**Description:** Crear `src/game/oleaje.ts` con las constantes y la curva asimétrica de amplitud fija: la subida ocupa ~40 % del ciclo y la bajada ~60 %, con tramos suaves (por ejemplo, dos medios cosenos de distinta duración). En `GameScene`, al montar los sprites, buscar `Fondo__orilla__use22` y `Fondo__hoyo_mar__g1924` en `spriteImageMap`, ponerles el pivote y guardar su escala de reposo. En `update(time)` aplicarles `oleaje(time)`. Exponer el objeto de constantes en `window.__oleaje`. Esta tarea va primero porque es la que puede tumbar la idea: comprueba la HD, los bordes, los fps y si existe una amplitud que funcione.

**Acceptance criteria:**
- [ ] `oleaje(t)` está siempre en `[1, 1 + AMPLITUD]`, vale 1 al empezar cada ciclo, es periódica y sube en menos tiempo del que baja.
- [ ] El agua avanza y retrocede sobre la playa en un ciclo de ~8 s. Las manchas de `hoyo_mar` se mueven con ella, y las capas que no son de agua no se mueven.
- [ ] En el pico de la ola no se ven rendijas en la diagonal del muelle ni en los bordes del mundo.

**Verification:**
- [ ] Tests: `npm test` (nuevo `src/game/oleaje.test.ts`)
- [ ] Tipos y build: `npm run build`
- [ ] Sin regresiones: `npm run test:e2e`
- [ ] Manual (`npm run dev`): zoom máximo sobre la orilla y sobre la diagonal del muelle, comprobando que la HD y la 1× no se separan. Probar `window.__oleaje.AMPLITUD` con 0,005, 0,01 y 0,015 al zoom inicial.

**Dependencies:** Ninguna

**Files likely touched:**
- `src/game/oleaje.ts` (nuevo)
- `src/game/oleaje.test.ts` (nuevo)
- `src/game/scenes/GameScene.ts`

**Estimated scope:** S

### Checkpoint 1: en el Mac de referencia
- [ ] La HD sigue al agua al hacer zoom; si no, se para aquí y se rediseña antes de seguir.
- [ ] No hay caída de fps con el oleaje (comparar con `AMPLITUD = 0`).
- [ ] Se elige la amplitud para el zoom inicial (~0,21 en el Mac) y se pasa a la constante.
- [ ] Revisión humana del movimiento: ¿se ve calmado?

### Fase 2: La espuma va detrás

## Task 2: La espuma repite la ola con retraso

**Description:** Añadir el grupo espuma (`Fondo__mar__path135`, `Fondo__hoyo_orilla__g1925`) al mismo bucle con `oleaje(time − RETRASO_MS)`, con `RETRASO_MS` ≈ ¼ del periodo. Con el pivote dentro del agua (ver Architecture Decisions) ya no hace falta que el borde de `mar` sea colineal con la diagonal, pero hay que comprobar en el pico que la espuma tampoco asoma por la esquina del muro.

**Acceptance criteria:**
- [ ] Al retirarse el agua, la franja blanca se ensancha y luego retrocede detrás del agua.
- [ ] Los charcos de `hoyo_orilla` se mueven con la espuma y nunca quedan sueltos sobre la arena.
- [ ] En el pico de la ola, ninguna capa de la espuma abre rendijas.

**Verification:**
- [ ] Tests: `npm test` (el retraso se prueba como `espuma(t) === oleaje(t − RETRASO_MS)` si se extrae a una función)
- [ ] Build: `npm run build`
- [ ] Manual: mirar varios ciclos en las zonas donde la franja blanca es estrecha. Que el azul tape la espuma un momento está aceptado; que el agua y la espuma se separen y dejen ver la arena entre las dos, no.

**Dependencies:** T1 y Checkpoint 1

**Files likely touched:**
- `src/game/oleaje.ts`
- `src/game/scenes/GameScene.ts`

**Estimated scope:** XS

### Fase 3: Cada ola distinta

## Task 3: Amplitud variable por ciclo

**Description:** Cada ciclo `k = floor(t / PERIODO_MS)` tiene una amplitud `AMPLITUD · (1 + VARIACION · r(k))`, con `r(k)` en `[−1, 1]` sacado de un hash determinista de `k`. No se usa `Math.random`, para que la espuma, que va con retraso, vea exactamente la misma ola. `VARIACION` vale ~0,2. Como `w` vale 0 en el límite entre ciclos, la curva sigue siendo continua.

**Acceptance criteria:**
- [ ] `oleaje(t)` es continua en el límite entre ciclos: la diferencia entre `t = k·P − ε` y `k·P + ε` tiende a 0.
- [ ] La amplitud de cada ciclo queda dentro de `[0,8·A, 1,2·A]` y es la misma en dos llamadas con la misma `t`.
- [ ] Al mirar un minuto seguido no se nota el bucle, y ninguna ola es exagerada.

**Verification:**
- [ ] Tests: `npm test` (continuidad, rango y determinismo)
- [ ] Build: `npm run build` · e2e: `npm run test:e2e`
- [ ] Manual: un minuto de observación al zoom inicial

**Dependencies:** T2

**Files likely touched:**
- `src/game/oleaje.ts`
- `src/game/oleaje.test.ts`

**Estimated scope:** XS

### Checkpoint 2: completo
- [ ] `npm test`, `npm run build` y `npm run test:e2e` en verde
- [ ] En el Mac de referencia (y en el kiosko si está disponible): fps estables y HD correcta durante varios minutos
- [ ] `docs/ideas/oleaje-orilla.md` actualizado con los valores elegidos y los supuestos ya validados
- [ ] Revisión humana final

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| La HD no sigue al Container escalado, o se descoloca con un pivote fuera de `[0, 1]` | Alto | Va en T1 y se comprueba en el Checkpoint 1 antes de seguir. `syncContainer` ya copia la escala y `getOrigin` lee el pivote, pero nunca se ha probado con un origen > 1. |
| La diagonal que se mete bajo el muro asoma donde el muro es más estrecho | Medio | Comprobado en T1 con un 2,5 % en el muelle, el embarcadero y las rocas: no asoma. Se vuelve a mirar con la espuma en T2. |
| A zoom 0,21 no se nota nada y a zoom 2,5 se nota demasiado | Medio | Ajuste en vivo con `window.__oleaje`. Si no hay un término medio, se vuelve a la idea de la amplitud según el zoom (variación 6 de la idea). |
| El escalado de 2 texturas de escena completa más sus chunks HD baja los fps en la HD 4000 | Bajo | Solo cambia la matriz de transformación, sin texturas nuevas. Se mide en el Checkpoint 1 comparando con `AMPLITUD = 0`. |
| Una capa escalada tapa por un borde algo que antes se veía | Bajo | La escala va siempre hacia fuera y es pequeña (≤ 1,5 %). Se revisa en el pico de la ola. |

## Open Questions
- ¿El kiosko arranca siempre al zoom inicial (que cubre la pantalla)? De eso depende la amplitud que se elija en el Checkpoint 1.
