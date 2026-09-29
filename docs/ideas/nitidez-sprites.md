# Nitidez y artefactos en el export de sprites

## Problem Statement
¿Cómo hacemos que los sprites exportados de `escena.svg` se vean en Phaser sin líneas fantasma y con la nitidez del SVG, dentro de un presupuesto de memoria razonable para escritorio?

## Diagnóstico (verificado)

| Síntoma | Causa | Evidencia |
|---|---|---|
| Línea blanca vertical sobre el pádel | Texturas potencia de 2 → Phaser usa `gl.REPEAT` (`node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:1701`). Los atlas dedicados no tienen padding, así que el filtrado LINEAR mezcla el borde izquierdo con la columna 2047 (suelo opaco `217,249,157`) | La línea está en x=4201 del mundo, exactamente el borde izquierdo de `Puerto__suelo_tierra`. Afecta a los 19 atlas dedicados (0–18). Introducido en `108f0ab` |
| Pérdida de definición | Los sprites de más de 2048 px se reducen (mar/orilla/fondo al 30 %, muros/playa/suelo al ~80 %) y se rasteriza a 1× con zoom máximo 2.5 | Frames del atlas frente a `bounds` |
| Desalineación de hasta 1 px | La primera pasada de sharp renderiza el SVG (en mm) a 6803 px y el recorte trabaja a 6804 | `sharp().metadata()`: escala 0.99985 |
| VRAM desperdiciada | 6 sprites con `bounds: null` exportados como PNG vacíos de 2048×1126 | md5 idéntico en `atlas-10` a `atlas-15` |

Presupuesto de memoria: el contenido real suma ~79 Mpx a 1× (3× el área de la escena, por las capas de fondo apiladas). Aunque el empaquetado fuera perfecto, 2× cuesta ~2.8 GB y 2.5× ~4.4 GB de VRAM con mipmaps.

## Recommended Direction
Arreglar el pipeline actual en dos fases.

**Fase A: bugs, sin cambiar la resolución.**
- `setWrap(CLAMP_TO_EDGE)` en cada atlas al cargarlo.
- Padding y extrude también en los atlas de un solo sprite.
- Escala explícita e idéntica en las dos pasadas de sharp.
- Descartar los sprites con `bounds: null`.
- `maxAtlasSize` a 4096.
- Trocear en tiles, en lugar de reducir, los sprites que no quepan.

Con esto desaparecen la línea blanca y el emborronado a zoom ≤ 1, con una memoria similar a la actual.

**Fase B: nitidez por encima de 1× con LOD.**
- Descartado aplanar el fondo, porque muchos elementos del fondo se van a animar.
- Descartado cargarlo todo a 2.5×: se probó y un equipo con Intel UHD 630 no puede renderizarlo (88 atlas, ~7.9 GB de VRAM).

Cómo funciona:
- **Export.** `split.js` genera, además de los atlas a 1× (siempre cargados), la versión a `hdScale` (2.5, el zoom máximo) de cada sprite en chunks PNG en `sprites/hd/`. Cada chunk es una textura potencia de 2 de hasta 1024 px, con mipmaps y 4 px de solape real con los vecinos. Son 1064 chunks y 30 MB en disco, que solo se descargan bajo demanda. Los bounds a 1× se amplían a medidas pares para que la HD cubra exactamente el mismo rectángulo.
- **Juego (`src/game/SpriteLod.ts`).** Por encima de zoom 1.05 (y por debajo de 0.95 se desactiva) carga los chunks que cortan la vista más un 25 % de margen.
  - Un sprite pasa a HD cuando todo lo visible está cargado; si falta algo, vuelve a 1×, así que nunca hay huecos.
  - Sprites de un chunk: se cambia la textura del mismo `Image`, sin tocar input, animaciones ni profundidad.
  - Sprites de varios chunks: un `Container` copia la transformación del base cada frame y va justo después de él en la lista de dibujado. Si el base es interactivo, reenvía los eventos de puntero.
  - Memoria: presupuesto LRU de 768 MB, que baja a 192 MB al alejar.

## Key Assumptions to Validate
- [x] `CLAMP_TO_EDGE` y el padding eliminan la línea (validado: un detector de columnas claras encuentra la línea en la captura original y no en el render nuevo): regenerar, abrir la vista del pádel y comparar con `docs/bugs/linea_blanca.png`
- [x] Los tiles de sprites troceados no generan costuras: revisar las uniones del mar a zoom mínimo, 1 y 2.5 (validado en el juego con 16 px de extrude)
- [ ] 4096 es seguro en los equipos objetivo: `renderer.getMaxTextureSize()` en la máquina más modesta
- [x] La HD mejora la nitidez: error medio frente al SVG rasterizado al mismo zoom, con la misma cámara. Pádel a 2.5: 3.49 → 0.85. Castillo a 1.1: 3.94 → 3.09. Árboles a 1.6: 7.92 → 6.60 (los árboles se animan)
- [x] Sin costuras entre chunks HD: detector de líneas en pádel (2.5), mar (1.2) y árboles (1.6)
- [x] Un objeto interactivo de varios chunks sigue recibiendo clics en HD (faro a zoom 2)
- [x] Al alejar se libera la HD: 187 MB en caché (presupuesto de 192 MB)
- [ ] Pico de memoria aceptable en el hardware real: en headless la vista más cargada (mar a 1.2) llega al presupuesto de 768 MB
- [ ] Sin tirones al subir texturas HD en el hardware real (en headless no se puede medir)
- [x] Los mipmaps no sangran a zoom mínimo: con 2 px de extrude aparecía una costura clara en el tile del mar a zoom ~0.24 (niveles de mip 2-3); con 16 px desaparece

## MVP Scope
**Dentro (fase A):** `utils/split.js` (escala fija, padding universal, tiling de sobredimensionados, filtro de nulos, atlas 4096) y `Preloader.ts`/`GameScene.ts` (clamp, sprites en varios tiles).
**Fuera de la fase A:** resolución mayor de 1× (resuelta en la fase B con LOD).

## Not Doing (and Why)
- **Cargar todo a 2.5×**: ~7.9 GB de VRAM; probado y descartado en una Intel UHD 630.
- **Aplanar las capas de fondo**: muchos elementos del fondo se van a animar.
- **Rasterizar en el navegador (`load.svg`)**: no resuelve la memoria y encarece la carga.
- **Solapes contra costuras de antialias**: no hay evidencia de que existan; la línea observada era de wrap.

## Open Questions
- ¿Hacen falta ajustes de presupuesto o de umbral de zoom tras probar en el hardware objetivo?
