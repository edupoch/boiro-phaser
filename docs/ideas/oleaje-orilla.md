# Oleaje en la orilla

## Problem Statement
¿Cómo podríamos hacer que la orilla de Boiro respire como una playa de verdad, con calma, sin tocar el SVG y sin gastar VRAM en el equipo de referencia?

## Contexto
- Los nombres engañan: `mar` (`Fondo__mar__path135`) es la forma **blanca** (espuma / arena mojada) y `orilla` (`Fondo__orilla__use22`) es el **agua azul** con el borde ondulado, encima. La franja blanca visible es el hueco entre ambas.
- Orden de dibujo: `playa → mar → orilla → hoyo_orilla → hoyo_mar`. `hoyo_orilla` son charcos azules dentro de la franja blanca.
- Cada capa es un sprite de escena completa troceado en 2 tiles de 3402×2560, con chunks HD en `SpriteLod`. Moverlas con transformaciones no gasta VRAM; deformarlas sí.
- Desplazarlas abre rendijas en el borde inferior, el izquierdo y la diagonal del muelle. La diagonal es una recta de (6815, 3680) a (2426, 1185) en el path de `orilla`, y el borde de `mar` sigue la misma línea.

## Recommended Direction
El agua (`orilla`) crece y encoge con una curva asimétrica: sube algo más rápido de lo que se retira y la amplitud varía un ±20 % en cada ciclo. La espuma (`mar`, junto con sus charcos) repite la misma ola un cuarto de ciclo después, así que al retirarse el agua queda un momento visible la franja de arena mojada.

En vez de desplazar las capas, se **escalan** (siempre ≥ 1) desde un pivote dentro del agua, en (2426, 3500), justo debajo de la esquina donde la playa se junta con el muro. Todos los bordes se alejan del pivote: la orilla avanza hacia la arena, la diagonal del muelle se mete bajo el muro y los bordes inferior e izquierdo salen del mundo. Ningún borde se abre sin tocar el SVG.

*La idea original ponía el pivote en (6815, 3680), sobre la diagonal. No abría rendijas, pero la punta del agua se deslizaba por la diagonal y su contorno asomaba sobre la arena pasada la esquina del muro (visto en la tarea 1).*

Todo lo mueve un único reloj en `GameScene.update()`: `oleaje(t)` da la escala del agua y la espuma usa `oleaje(t − retraso)`. Así el desfase es exacto y la espuma sigue a cada ola concreta. Se descartan los tweens de Phaser porque, con la amplitud variable por ciclo, cada tween sortearía la suya y la espuma dejaría de seguir a su ola.

## Key Assumptions to Validate
- [ ] Los chunks HD de `SpriteLod` siguen al Container escalado frame a frame → hacer zoom al máximo sobre la orilla con el oleaje activo y comprobar que la HD y la 1× no se separan. *(En Chromium a zoom 2,5 se ven bien; falta comprobarlo en el Mac.)*
- [ ] Hay una amplitud que se ve a zoom ~0,19 (20 unidades ≈ 4 px de pantalla) y no exagera a zoom 1 → probar escalas de 1,005, 1,01 y 1,015 en el Mac de referencia.
- [ ] Que el azul pase por encima de la espuma en las zonas estrechas (hasta ~0,7× la amplitud con un cuarto de ciclo de retraso) queda bien → revisarlo a ojo en el pico de la ola.
- [x] Los bordes no se abren → comprobado en la tarea 1 con un 2,5 % en el muelle, el embarcadero, las rocas y la vista general.
- [ ] No hay caída de fps en el Mac → comparar con y sin oleaje.

## MVP Scope
**Incluye:** la función `oleaje(t)`, la escala con pivote de `orilla` y `mar`, y el movimiento de `hoyo_orilla` con la espuma. Las constantes (periodo ~8 s, amplitud, retraso, pivote) van juntas en un mismo sitio para ajustarlas en el Mac.

**Fuera:** todo lo de la lista siguiente.

## Not Doing (and Why)
- **Shader para deformar la orilla:** cuesta mucho de GPU en la HD 4000 y no casa con un movimiento calmado.
- **Retocar el SVG:** es una restricción, y el pivote lo hace innecesario.
- **Más amplitud en modo reposo:** obliga a comunicar React con la escena. Solo merece la pena si la calma no basta para llamar la atención.
- **Sincronizar con `praia.mp3`:** no se ha pedido, y un audio en bucle desfasado de la ola se notaría más que no sincronizar nada.
- **Tweens de Phaser:** no garantizan que la espuma siga a su propia ola cuando la amplitud varía.

## Open Questions
- ¿`hoyo_mar` qué es y con qué capa va?
- ¿Qué zoom tiene el kiosko en reposo? De eso depende la amplitud.
