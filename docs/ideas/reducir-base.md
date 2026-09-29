# Reducir la memoria de la base a 1×

> Idea futura. Solo se aborda si el Checkpoint A de `tasks/plan.md` confirma que la memoria aprieta en el equipo de referencia.

## Problem Statement
¿Cómo podríamos reducir la VRAM que ocupan los atlas a 1× (siempre cargados) sin que el juego se vea peor, para dejar margen a la HD en equipos con memoria de vídeo compartida?

## Diagnóstico (medido el 2026-09-29)
- Los 12 atlas a 1× ocupan **~981 MB de VRAM** con mipmaps: 11 de 4096² y uno de 2048×4096.
- El equipo de referencia (MacBook Pro de 2012, HD 4000) tiene un **máximo dinámico de 1536 MB**. Con la base más el presupuesto HD de 768 MB se pasa del límite.
- **El empaquetado no es el problema**: los atlas tienen una ocupación del ~83 % de media (entre el 43 % de `atlas-11` y el 93 % de `atlas-0`).
- **El problema es lo que se guarda**: los rectángulos de los frames suman **158 Mpx**, 6,2 veces el área de la escena (25,5 Mpx). Según `nitidez-sprites.md`, el contenido real ronda los 79 Mpx, así que **cerca de la mitad de los píxeles son transparentes** dentro de los rectángulos de sprites grandes e irregulares.
- **Las capas de fondo dominan**: `Fondo` ocupa 57,6 Mpx y `fondo` 25,5 Mpx, más de la mitad de la base. Siguen `Puerto` (16,1), `costa` (10,9), `Bosque` (9,3), `Casas` (9,2) y `Mar` (8,1).

## Opciones, de menos a más coste
1. **Trocear los sprites grandes y descartar los tiles vacíos.** `split.js` ya trocea los sprites que no caben (`__tile_x_y`) y `GameScene` los agrupa en un Container. Se trataría de aplicarlo a todos los sprites por encima de cierto tamaño y no exportar los tiles totalmente transparentes. No cambia nada de lo que se ve. Hay que medir cuánto se ahorra en la práctica, porque depende de la forma de cada sprite, y cuántos objetos de dibujado más añade.
2. **Base a 0,5× para las capas de fondo.** En el Mac, el zoom mínimo es ~0,19 y la base se dibuja casi siempre muy reducida, usando mipmaps pequeños. Una base a 0,5× es igual por debajo de zoom 0,5 y ocupa 4 veces menos. A cambio, entre 0,5 y 1,05 se vería más blanda, salvo que esas capas pasen antes a HD (un umbral de zoom por sprite en `SpriteLod`), lo que consume presupuesto HD.
3. **Texturas comprimidas (KTX2/BCn).** Dividen entre 4 y 8 la base y la HD. Phaser 4 ya tiene `KTXParser` y `CompressedTextureFile`. Obliga a rehacer el pipeline de `split.js` y a gestionar el soporte según la GPU, y puede dejar artefactos de compresión en ilustración plana.

## Recomendación
Empezar por la opción 1: ahorra memoria sin cambiar lo que se ve. La 2 solo si la 1 no basta, y la 3 como proyecto aparte.

## Open Questions
- ¿Cuánto ahorra la opción 1 de verdad? Medirlo con un script sobre los PNG a 1× (tiles de 512 px totalmente transparentes) antes de tocar el export.
