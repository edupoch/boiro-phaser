# Plan de implementación: precarga y transición suave de la HD

Spec: `docs/ideas/precarga-hd.md`

## Overview
Hacer que el paso de 1× a HD no se note al hacer zoom. El plan tiene tres capas sobre `SpriteLod`:
- la red se quita del camino con una descarga en segundo plano de los blobs;
- la carga empieza antes gracias al zoom suavizado y a la prioridad por intención;
- lo que llegue tarde se disimula con un fundido.

Antes de nada se mide, porque el orden de las fases 2 y 3 depende de si domina la red o la CPU/GPU.

## Architecture Decisions
- **Blobs en memoria, no Service Worker ni Cache Storage.** Son 30 MB, no dependen de las cabeceras HTTP del servidor y el kiosko tiene conexión, así que no hace falta que persistan entre sesiones.
- **`HdBlobStore` es una clase aparte (`src/game/HdBlobStore.ts`) que pertenece a `SpriteLod`.** Solo sabe descargar y guardar blobs. `SpriteLod` sigue decidiendo qué se sube a la GPU. Cuando existe el blob, `SpriteLod` carga con `load.image(key, URL.createObjectURL(blob))`, porque Phaser ya carga por XHR con blob (`ImageFile.js`), y revoca el object URL en `FILE_COMPLETE`. El blob se conserva, así que una textura expulsada por el LRU se recarga sin red.
- **La descarga en segundo plano nunca compite con la carga bajo demanda.** Se pausa mientras `SpriteLod` tenga cola o peticiones en vuelo, con una concurrencia de 2.
- **El fundido vive dentro de `SpriteLod`.** Se aplica solo al pasar a HD, no al volver a 1×. El alfa de la capa HD es `alfa del objeto × progreso del fundido`.
- **El zoom suavizado vive en `GameScene`.** La rueda fija un `targetZoom` y un ancla (el punto del mundo bajo el puntero), y `update()` interpola hacia él con una exponencial dependiente del tiempo, de unos 250 ms, sin tweens. `GameScene` pasa a `SpriteLod` la intención (`setZoomIntent(worldPoint, targetZoom)`).
- **Equipo de referencia: MacBook Pro 13" de mediados de 2012 (MacBookPro9,2), con macOS 12.2.1 y Firefox 156.** i5 de 2 núcleos a 2,5 GHz, 8 GB de RAM, Intel HD Graphics 4000 con un máximo dinámico de 1536 MB de VRAM, `MAX_TEXTURE_SIZE` 8192 y pantalla de 1280×800 a dpr 1. **Los atlas a 1× ya ocupan unos 981 MB de VRAM** (11 de 4096² y uno de 2048×4096, con mipmaps). Con el presupuesto HD de 768 MB se llegaría a ~1,75 GB, más que los 1536 MB, así que en este equipo el presupuesto HD tiene que rondar los 384 MB. Las métricas las calcula el propio juego (T1) para no depender de las herramientas de Chrome, porque Firefox no tiene limitación de CPU.
- **Sin framework de tests nuevo.** La verificación usa `npx tsc --noEmit`, `npm run build-nolog` y medición reproducible en el navegador con los helpers de depuración de la tarea 1.

## Dependency graph

```
T1 Medición (métricas + escenario reproducible)
 │
 ├── Checkpoint A: línea base en 3 condiciones → decidir orden
 │
 ├── T2 HdBlobStore (descarga en segundo plano) ──────────┐
 │    └── T2b Subida sin tirones (createImageBitmap)      │
 │                                                        │
 ├── T3 Fundido: sprites de varios chunks (Container)     │
 │    └── T4 Fundido: sprites de un chunk (overlay)       │
 │                                                        │
 └── T5 Zoom suavizado (GameScene, independiente del LOD) │
      └── T6 Prioridad por intención (SpriteLod) ◄────────┘ (reordena también la descarga de fondo)
```

T2, T3/T4 y T5 son independientes entre sí. T5 toca solo `GameScene.ts` y se puede hacer en paralelo con T2–T4. T6 necesita T5 (la fuente del `targetZoom`) y, si T2 ya existe, también reordena la descarga de fondo.

---

## Fase 1: Medición

### Task 1: Métricas de latencia HD y escenario reproducible

**Description:** Instrumentar `SpriteLod` para saber qué fase domina el retraso y cuánto tarda en verse la HD, y añadir un escenario de prueba que se pueda repetir siempre igual. Por cada chunk se mide la **red** (desde que se pide al loader hasta `FILE_COMPLETE`) y la **subida**: el coste síncrono de `handleFileComplete` más el del primer frame en que la textura se dibuja, porque la decodificación del `Image` puede hacerse de forma perezosa en `texImage2D`. Métrica de experiencia: **tiempo hasta HD completa**, desde el primer evento de rueda de un acercamiento hasta que todas las entradas visibles tienen `hdActive`. Métrica de fluidez: el frame más largo durante ese intervalo.

**Acceptance criteria:**
- [ ] `__spriteLod.getStats()` devuelve la mediana y el p95 de red y de subida por chunk, el último tiempo hasta HD completa y el peor frame durante la transición.
- [ ] Solo en DEV, `__lodBench(escenario)` coloca la cámara en un punto fijo a zoom mínimo, limpia la caché HD, simula el acercamiento hasta 2.5 y devuelve las métricas. Hay al menos tres escenarios: pádel, faro y mar.
- [ ] Sin `?lodDebug`, la instrumentación no cuesta nada en producción, y el benchmark va en un chunk aparte que no se descarga.
- [ ] En DEV o con `?lodDebug` (para medir en el Mac desde GitHub Pages), el presupuesto HD se puede cambiar por URL (`?lodBudget=384`) para comparar sin recompilar.

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: ejecutar `__lodBench('padel')` tres veces seguidas en local y comprobar que los resultados son estables (±20 %)
- [ ] Manual: registrar la línea base en una tabla dentro de este plan, en tres condiciones: local en el equipo de desarrollo, "Regular 4G / LTE" (limitación de red de Firefox) en el equipo de desarrollo, y el Mac de referencia sin limitación
- [ ] Manual: en el Mac, `getStats().megabytes` en su punto más alto y confirmar que no aparece `webglcontextlost` en la consola

**Dependencies:** Ninguna

**Files likely touched:**
- `src/game/SpriteLod.ts`
- `src/game/scenes/GameScene.ts` (exponer `__lodBench` en DEV)

**Estimated scope:** S

### Checkpoint A: Línea base
- [x] Tabla de línea base rellenada (3 escenarios × 3 condiciones)
- [x] Presupuesto de memoria validado en el Mac (sin pérdida de contexto; se mantienen 768 MB, ver las conclusiones): comparar `?lodBudget=768` con `?lodBudget=384` (peor frame, pérdida de contexto) y decidir el valor por defecto. Lo que se decida puede ir en una tarea aparte (presupuesto fijo más bajo o calculado según la pantalla); no se mezcla con T2.
- [x] Decisión con el humano (se añade la T2b después de la T2): si la subida y la decodificación dominan claramente sobre la red, se adelantan T3/T4 y se valora añadir la idea 5 (decodificar con `createImageBitmap` en un worker) antes de T2

**Línea base (2026-09-29, GitHub Pages con `?lodDebug`)**: `hastaHdMs` / `peorFrameMs` (chunks, MB)

| Escenario | Equipo de desarrollo | Equipo de desarrollo, Regular 4G / LTE | Mac, `lodBudget=768` | Mac, `lodBudget=384` |
|---|---|---|---|---|
| Pádel | 1102 / 83 (60, 313) | 3282 / 66 (55, 287) | 2219 / 183 (30, 160) | 2451 / 250 (31, 165) |
| Faro | 1254 / 100 (70, 363) | 2419 / 84 (70, 363) | 2706 / 349 (34, 176) | 1791 / 200 (28, 144) |
| Mar | 2155 / 83 (148, 750) | 8287 / 66 (147, 747) | 4041 / 349 (51, 263) | 3843 / 648 (51, 263) |

Por chunk (p50 / p95, ms):

| | Red | Proceso | Subida |
|---|---|---|---|
| Equipo de desarrollo | 46–56 / 80–96 | 24–27 / 63–69 | 5 / 9–10 |
| Regular 4G / LTE | 77–114 / 639–991 | 8–11 / 39–45 | 5 / 8–10 |
| Mac | 190–301 / 355–606 | 42–104 / 176–319 | 16–20 / 34–62 |

Sin `webglcontextlost` ni errores en ninguna condición.

**Conclusiones y decisiones (Checkpoint A):**
- **Con mala conexión domina la red** (p95 de ~1 s por chunk y 8,3 s en el mar). La T2 sigue siendo la primera tarea.
- **En el Mac, el problema principal son los tirones**: frames de 350–650 ms. La subida es 3–4 veces más cara que en el equipo de desarrollo y el proceso tiene un p95 de ~300 ms. Ni la precarga ni el fundido lo arreglan, así que se añade la **T2b** (decodificar fuera del hilo principal y limitar las subidas por frame) justo después de la T2.
- **Presupuesto: se mantiene en 768 MB por defecto.** No hubo pérdida de contexto. El benchmark empieza con la caché vacía, así que no ejercita el presupuesto: `evict` nunca libera lo necesario para la vista, y el presupuesto solo limita la caché de lo que ya no se ve. Se valida en el Checkpoint B moviéndose por el mapa a zoom alto en el Mac.
- **El número de chunks por vista depende de la pantalla**: en el equipo de desarrollo hacen falta 2–3 veces más que en el Mac. En el mar, la vista del equipo de desarrollo ya ocupa 750 MB.

**Cómo medir.** En DEV (`npm run dev-nolog`) o en GitHub Pages con `?lodDebug` en la URL (por ejemplo, `?lodDebug&lodBudget=384`), después de "Comecemos", ejecutar en la consola `await __lodBench('padel')`, `await __lodBench('faro')` y `await __lodBench('mar')`. Anotar `hastaHdMs` y `peorFrameMs`, y como detalle red, proceso y subida (p50/p95) y `memoriaMb`. Por defecto se evita la caché HTTP. Con `__lodBench('padel', { bustCache: false })` se usa. Para el presupuesto: `?lodBudget=384` en la URL.

**Referencia en Chromium sin interfaz (2026-09-29, 1280×800, renderizado por software; no sirve como línea base).** Pádel: 3,2–3,3 s (35 chunks, 184 MB). Faro: 5,1 s (57 chunks, 299 MB). Mar: 9,1 s (99 chunks, 505 MB). Peor frame de 230–270 ms. Por chunk: red ~370 ms, proceso ~115 ms, subida ~5,5 ms. Cuatro ejecuciones del pádel quedan a menos del 6 % entre sí.
- **La "red" de ~370 ms sirviendo en local no es red.** Sale igual con la caché HTTP caliente (el servidor de Vite responde `Cache-Control: no-cache`, así que revalida en cada petición). Es sobre todo espera: el loader arranca las peticiones en su tick de `update`, y aquí el hilo principal está saturado con frames de 100–250 ms. En hardware real será distinto, así que hay que medirlo allí.
- **El tiempo total lo marcan los lotes**: 35 chunks ÷ 6 simultáneos × ~0,5 s ≈ 3 s. Además de la precarga, `maxConcurrentLoads` y el coste por chunk en el hilo principal pueden pesar tanto como la red. Hay que revisarlo en el Checkpoint A con los datos reales.
- ~~El mar a 1.2 no cabe con 384 MB~~: incorrecto, porque `evict` nunca libera lo necesario para la vista actual (ver las conclusiones del Checkpoint A).

---

## Fase 2: Quitar la red y disimular

### Task 2: Descarga de la HD en segundo plano

**Description:** Crear `HdBlobStore`, que descarga con `fetch` todos los chunks HD registrados y guarda sus blobs en memoria. Empieza unos segundos después de que la escena esté lista, usa una concurrencia de 2, se pausa mientras `SpriteLod` tenga cola o peticiones en vuelo, ordena por distancia del chunk al centro de la cámara (reordenando cada cierto tiempo) y no hace nada si `navigator.connection?.saveData` está activo. `SpriteLod.pumpQueue` usa el blob si existe y la URL de red si no. Si falla una descarga de fondo, ese chunk se deja para la carga bajo demanda.

**Acceptance criteria:**
- [ ] Unos minutos después de arrancar en local, `getStats()` indica 1064/1064 blobs y unos 30 MB, y ningún chunk se ha descargado dos veces (se comprueba en la pestaña Network).
- [ ] Con "Regular 4G / LTE", cuando la descarga de fondo ha terminado, la mediana de red por chunk del benchmark baja a menos de 5 ms.
- [ ] Una textura expulsada por el LRU se recarga sin petición de red.

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: repetir la tabla de línea base con la descarga completa y comparar
- [ ] Manual: en el Mac de referencia, jugar mientras descarga y comprobar que el peor frame no empeora de forma apreciable respecto a la línea base
- [ ] Manual (Chrome, porque Firefox no expone `navigator.connection`): activar "Save-Data" y comprobar que no se descarga nada en segundo plano

**Dependencies:** T1

**Files likely touched:**
- `src/game/HdBlobStore.ts` (nuevo)
- `src/game/SpriteLod.ts`
- `src/game/scenes/GameScene.ts` (arranque tras registrar los sprites)

**Estimated scope:** M

### Task 2b: Subida sin tirones

**Description:** En el Mac hay frames de 350–650 ms mientras llega la HD. Primero se confirma la causa: se amplían las métricas para registrar, en el peor frame, cuántas texturas se subieron y cuánto tardaron en total. Después, como la T2 ya deja los blobs en manos de `SpriteLod`, se deja de usar el loader de Phaser para la HD: blob → `createImageBitmap` (decodifica fuera del hilo principal) → cola de subida → como mucho N texturas por frame (empezando por 1) con `textures.addImage`, `CLAMP_TO_EDGE` y el frame `hd`, como ahora. Si `createImageBitmap` no está disponible o falla, se vuelve al camino del loader.

**Acceptance criteria:**
- [ ] En el Mac, el peor frame del benchmark baja claramente respecto a la línea base (objetivo: ≤ 100 ms) en los tres escenarios.
- [ ] `hastaHdMs` no empeora más de un 20 % en el equipo de desarrollo a cambio de repartir las subidas.
- [ ] Las texturas HD se siguen viendo sin costuras ni sangrado (bordes de los chunks, mipmaps a zoom mínimo): mismas comprobaciones visuales que en `nitidez-sprites.md`.

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: repetir el benchmark en el Mac y en el equipo de desarrollo

**Dependencies:** T2

**Files likely touched:**
- `src/game/SpriteLod.ts`

**Estimated scope:** M

**Estado de T2 y T2b (2026-09-29): implementadas, pendientes de validar en el Mac.**
- T2: 1064/1064 blobs (26,7 MB) sin peticiones duplicadas. La descarga de fondo se reanuda después del benchmark y con Save-Data no se descarga nada (comprobado en Chromium sin interfaz).
- T2b: el tope de subidas por frame pasa a ser un presupuesto de tiempo (`uploadBudgetMs` = 4 ms, `maxUploadsPerFrame` = 4, al menos una por frame). Phaser 4 sube con `flipY` y alfa premultiplicado, y WebGL ignora ambos con `ImageBitmap`, así que se piden en `createImageBitmap` y una comprobación de 1×2 píxeles cae al loader si el navegador no respeta la orientación. La captura del pádel a 2.5 es idéntica píxel a píxel a la del loader.
- Sin interfaz (solo relativo; frames de ~100 ms de base por el renderizado por software):

| | Peor frame | Pádel, con precarga | Pádel, sin precarga | Mar, con precarga |
|---|---|---|---|---|
| Loader (`?lodDecoder=loader`) | 183–283 ms | 3,0–3,3 s | 4,5 s | 8,6 s |
| Bitmap y presupuesto de 4 ms | 117–150 ms | 2,4–2,7 s | 3,5 s | 6,3 s |

- Hallazgo: sin interfaz, la "red" del Checkpoint A en local era sobre todo espera del loader de Phaser. Con la precarga y sin T2b, la espera solo se pasaba al "proceso", y sin precarga empeoraba (4,8 s), porque había dos saltos: `fetch` y luego el loader.
- Para medir en el Mac: `__lodBench('mar', { keepBlobs: true })` con precarga (esperar a que `__spriteLod.getStats().blobs` llegue a 1064/1064) y `__lodBench('mar')` sin precarga. Para comparar con el camino anterior, `?lodDecoder=loader`. Nuevas columnas: `subidasEnPeorFrame` y `msSubidaEnPeorFrame`.

### Task 3: Fundido de entrada para sprites de varios chunks

**Description:** Cuando un sprite de varios chunks pasa a HD, el objeto base sigue visible mientras el `hdContainer` pasa de alfa 0 al alfa del objeto en ~200 ms. Al terminar, se oculta el base, como ahora. `syncContainer` multiplica el alfa por el progreso del fundido. Si el sprite vuelve a 1× a mitad de fundido, el fundido se cancela y se queda en 1×. Es el caso más fácil (la capa HD ya es otro objeto) y deja preparada la mecánica para T4.

**Acceptance criteria:**
- [ ] En el faro y en el mar, el paso a HD se ve como un enfoque progresivo y no como un corte (se comprueba con una grabación de pantalla o con el Firefox Profiler con capturas).
- [ ] El faro (interactivo) sigue respondiendo al clic durante el fundido y después.
- [ ] Alejar a mitad de fundido no deja la capa HD visible ni el base oculto.

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: el detector de costuras del trabajo anterior sigue sin encontrar líneas en el mar a zoom 1.2 cuando el fundido ha terminado

**Dependencies:** T1

**Files likely touched:**
- `src/game/SpriteLod.ts`

**Estimated scope:** S

**Estado de T3 (2026-09-29): implementada y comprobada sin interfaz con `?lodFade=2000`.** El alfa del faro sube de forma lineal de 0 a 1 y el 1× se oculta justo al terminar. Alejar a mitad de fundido (alfa 0,5) oculta la HD y deja el 1× visible. El clic durante el fundido llega una sola vez (Phaser lo entrega solo al objeto de arriba, que lo reenvía). `?lodFade=ms` permite probar otras duraciones a ojo (0 lo desactiva). Pendiente: revisión visual en el Mac.

### Task 4: Fundido de entrada para sprites de un chunk

**Description:** Para sprites de un chunk (hoy es un `setTexture` directo), durante el fundido se crea una imagen HD temporal justo después del objeto en la lista de dibujado. Esa imagen copia su transformación cada frame, igual que `syncContainer`, y pasa de alfa 0 al alfa del objeto. Al terminar, se hace el `setTexture` actual y se destruye la imagen temporal. Hay que respetar `springAnimating`: si el muelle está en marcha, se espera para empezar el fundido, como ya se espera para el cambio de textura. La imagen temporal no es interactiva, porque el input sigue en el objeto base, que está visible.

**Acceptance criteria:**
- [ ] En el pádel y en los árboles animados, el paso a HD se ve progresivo y sin saltos de posición ni de escala al terminar el fundido.
- [ ] Hacer hover (muelle) durante o justo después del fundido no deja la escala mal.
- [ ] No queda ninguna imagen temporal huérfana después de acercar y alejar muchas veces seguidas (se comprueba que `scene.children.length` es estable).

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: el benchmark en local no muestra un peor frame mayor que la línea base

**Dependencies:** T3

**Files likely touched:**
- `src/game/SpriteLod.ts`

**Estimated scope:** S

### Checkpoint B: Red y fundido
- [ ] Tabla de benchmark repetida y comparada con la línea base
- [ ] Revisión visual con el humano en el equipo modesto
- [ ] `docs/ideas/precarga-hd.md`: marcar los supuestos validados o refutados

---

## Fase 3: Empezar antes

### Task 5: Zoom suavizado con la rueda

**Description:** `handleWheel` deja de aplicar el zoom directamente: acumula un `targetZoom` (con el mismo factor exponencial y el mismo límite) y guarda como ancla el punto de pantalla del puntero. En `update(time, delta)`, la cámara se acerca al objetivo con una interpolación exponencial dependiente de `delta`, de unos 250 ms para llegar al 95 %. En cada paso se mantiene fijo bajo el puntero el mismo punto del mundo y se aplica `clampCameraScroll`. Arrastrar para desplazar sigue funcionando durante la interpolación.

**Acceptance criteria:**
- [ ] Con ratón, un clic de rueda lleva de 1.0 a ~2.2 en unos 250 ms y no en un frame, y el punto bajo el cursor no se desplaza.
- [ ] Con trackpad, el zoom sigue siendo fluido y no se nota retraso ni rebote.
- [ ] Los límites de zoom y de scroll se respetan en todo momento, incluso en los bordes del mundo.

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: probar con ratón y con trackpad, y hacer zoom en las esquinas del mapa

**Dependencies:** Ninguna (se puede hacer en paralelo con T2–T4)

**Files likely touched:**
- `src/game/scenes/GameScene.ts`

**Estimated scope:** S

### Task 6: Prioridad por intención de zoom

**Description:** Nuevo método `SpriteLod.setZoomIntent(worldPoint, targetZoom)`, al que `GameScene` llama en cada evento de rueda de acercamiento. `SpriteLod` calcula la vista de destino (el rectángulo de tamaño `pantalla / targetZoom`, anclado de forma que `worldPoint` quede en la misma posición de pantalla) y, durante unos 1,5 s, pide sus chunks aunque el zoom actual esté por debajo de `enterZoom`. La cola deja de ser FIFO: se ordena primero por pertenencia a la vista de destino y después por distancia al punto de intención. Las claves de la intención cuentan como necesarias en `evict`, y fuera de la HD respetan el presupuesto de reposo. Si existe `HdBlobStore`, la intención también adelanta esos chunks en la descarga de fondo.

**Acceptance criteria:**
- [ ] En el benchmark con zoom suavizado, el tiempo hasta HD completa baja respecto a Checkpoint B en las tres condiciones. El objetivo es que, en local y en el Mac de referencia (con los blobs ya descargados), sea menor o igual que la duración de la animación de zoom.
- [ ] Mover el ratón por el mapa sin hacer zoom no dispara ninguna carga (la intención solo nace de la rueda hacia dentro).
- [ ] La memoria HD por debajo de `enterZoom` no pasa del presupuesto de reposo.

**Verification:**
- [ ] `npx tsc --noEmit` y `npm run build-nolog` sin errores
- [ ] Manual: repetir la tabla de benchmark

**Dependencies:** T5 (y T2 para la parte de la descarga de fondo)

**Files likely touched:**
- `src/game/SpriteLod.ts`
- `src/game/HdBlobStore.ts`
- `src/game/scenes/GameScene.ts`

**Estimated scope:** M

### Checkpoint C: Completo
- [ ] Tabla final frente a la línea base en los tres escenarios y las tres condiciones
- [ ] Prueba en el Mac de referencia (Firefox) y en el kiosko
- [ ] `docs/ideas/precarga-hd.md` actualizado con los resultados; `nitidez-sprites.md` enlazado si cambian los umbrales
- [ ] Revisión con el humano antes de hacer commit

---

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| 1× (~981 MB) más una HD de 768 MB supera los 1536 MB de VRAM dinámica de la HD 4000 | Alto | Comparar 768 con 384 en el Checkpoint A con `?lodBudget`. Bajar el valor por defecto o calcularlo según la pantalla |
| Domina la decodificación o la subida a la GPU, no la red | Alto | Por eso T1 va primero. En el Checkpoint A se reordena y se valora la idea 5 (worker con `createImageBitmap` y subida repartida entre frames) |
| Phaser sube la textura de forma perezosa y T1 mide mal la subida | Medio | Medir también el primer frame en que se dibuja la textura y usar la pestaña Performance para comprobarlo |
| La descarga de fondo provoca tirones en el equipo lento (callbacks de `fetch` o GC de blobs) | Medio | Concurrencia 2, pausa con cola bajo demanda, y en T2 se compara el peor frame |
| Durante el fundido se ven los bordes antialias más gruesos | Bajo | 200 ms es poco tiempo. Si molesta, se acorta el fundido o se usa una curva de entrada rápida |
| El zoom suavizado se siente "blando" | Medio | Duración ajustable en una constante. Validarlo con el humano en el Checkpoint C |
| La intención carga texturas que nunca se usan (el jugador cambia de idea) | Bajo | Caducidad de ~1,5 s y presupuesto de reposo. Las texturas sobrantes las expulsa el LRU |

## Open Questions
- Ninguna bloqueante.
