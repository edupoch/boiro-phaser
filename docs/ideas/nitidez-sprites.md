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

**Fase B: nitidez por encima de 1×.** Depende de una decisión de presupuesto. La palanca real es el solapamiento de capas estáticas, no el formato del atlas.

## Key Assumptions to Validate
- [x] `CLAMP_TO_EDGE` y el padding eliminan la línea (validado: un detector de columnas claras encuentra la línea en la captura original y no en el render nuevo): regenerar, abrir la vista del pádel y comparar con `docs/bugs/linea_blanca.png`
- [x] Los tiles de sprites troceados no generan costuras: revisar las uniones del mar a zoom mínimo, 1 y 2.5 (validado en el juego con 16 px de extrude)
- [ ] 4096 es seguro en los equipos objetivo: `renderer.getMaxTextureSize()` en la máquina más modesta
- [x] Los mipmaps no sangran a zoom mínimo: con 2 px de extrude aparecía una costura clara en el tile del mar a zoom ~0.24 (niveles de mip 2-3); con 16 px desaparece

## MVP Scope
**Dentro (fase A):** `utils/split.js` (escala fija, padding universal, tiling de sobredimensionados, filtro de nulos, atlas 4096) y `Preloader.ts`/`GameScene.ts` (clamp, sprites en varios tiles).
**Fuera:** resolución mayor de 1×.

## Not Doing (and Why)
- **Rasterizar a 2.5×**: 2.6–5 GB de VRAM con el desglose actual.
- **LOD con dos juegos de atlas**: duplica assets y lógica; solo si la fase B lo exige.
- **Rasterizar en el navegador (`load.svg`)**: no resuelve la memoria y encarece la carga.
- **Solapes contra costuras de antialias**: no hay evidencia de que existan; la línea observada era de wrap.

## Open Questions
- Fase B: ¿se pueden aplanar las capas que nunca se animan (fondo, mar, orilla, suelos) en una capa continua? El área bajaría de ~79 Mpx a ~25 Mpx más las piezas, y 2× costaría ~1 GB.
- ¿A qué zoom se juega la mayor parte del tiempo? Si es ~1, la fase A puede bastar.
