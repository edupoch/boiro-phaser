# Precarga y transición suave de la HD

## Problem Statement
¿Cómo podríamos conseguir que, al hacer zoom libre en cualquier punto del mapa, el paso de 1× a HD no se note, tanto en equipos modestos como con mala conexión, sin pasarnos del presupuesto de VRAM?

## Contexto
- La HD son 1064 chunks y 30 MB en disco. Tenerla toda en la GPU son ~7,9 GB, que ya se descartaron (ver `nitidez-sprites.md`).
- El retraso tiene tres fases: red, decodificación del PNG y subida a la GPU con mipmaps. No está medido cuál domina.
- Hoy `SpriteLod` no pide nada hasta pasar de zoom 1.05, con una cola FIFO de 6 peticiones simultáneas.
- Con rueda de ratón (`deltaY = ±100` en Chrome), cada clic multiplica el zoom por ~2,23 (`GameScene.ts`, `handleWheel`). Un solo clic lleva de 1.0 a 2.23 en un frame, así que no hay margen de tiempo para anticipar nada.

## Recommended Direction
Cambiamos el objetivo de "que la HD ya esté siempre" (imposible sin tenerlo todo en la GPU) a "que el cambio no se note". Lo conseguimos con tres capas que atacan fases distintas del retraso:

1. **Red a cero.** Cuando el juego está en marcha, se descargan los 1064 chunks (30 MB) como blobs en memoria, sin decodificar ni ocupar VRAM. `SpriteLod` los carga desde object URLs.
2. **Empezar antes.** Un zoom suavizado crea un margen de tiempo real, y durante un gesto de acercamiento los chunks se piden por prioridad según la distancia al puntero, aunque todavía no se haya pasado de 1.05.
3. ~~**Disimular lo que llegue tarde.** Fundido de ~200 ms de la HD sobre la 1×, en vez del `setTexture` seco.~~ Descartado tras probarlo (ver "Decisiones tomadas").

Primero se mide, porque qué pieza importa más depende de si domina la red o la CPU/GPU.

## Key Assumptions to Validate
- [x] **Qué fase domina el retraso.** Depende del equipo. Con mala conexión domina la red (p95 de ~1 s por chunk con 4G). En el Mac, además de esperar, había tirones: frames de 350–650 ms por subidas en el hilo principal. Ver el Checkpoint A en `tasks/plan.md`.
- [x] **La descarga en segundo plano no se nota al jugar.** Concurrencia 2, pausa con carga bajo demanda, 0 peticiones duplicadas y respeta Save-Data.
- [x] **Con los blobs precargados, el tiempo hasta la HD baja.** La red por chunk pasa a ~2 ms. En el Mac gana ~300 ms en pádel y faro con su conexión, y más con conexiones peores.
- [x] **El zoom suavizado deja margen suficiente**, pero solo si la intención nace desde el primer giro hacia dentro, también por debajo de 1,05. Con objetivo ≥ 1,05, el zoom logarítmico cruza el umbral ~15 ms después del clic. Ganancia en el Mac: faro −17 %, mar −7 %.
- [x] ~~**El fundido se percibe mejor que el corte.**~~ Refutado: aporta poco y en las sombras semitransparentes se ve raro. Descartado.
- [x] **30 MB de blobs en RAM son asumibles** (26,7 MB reales; el Mac tiene 8 GB).

## MVP Scope
**Dentro:**
- **Paso 0, medición.** Tiempos por fase en `SpriteLod`, visibles en `__spriteLod.getStats()`.
- **Paso 1, descarga en segundo plano.** Un `HdBlobStore` descarga con concurrencia 2 cuando no hay cola bajo demanda, ordenado por distancia al centro de la cámara, y se salta si `navigator.connection.saveData` está activo. `SpriteLod` usa el blob si ya está descargado.
- **Paso 2, fundido.** Al activar la HD, una imagen o Container por encima pasa de alfa 0 a 1 en ~200 ms, multiplicado por el alfa del objeto. Después se hace el cambio definitivo. Al volver a 1× no hay fundido, porque solo pasa al alejar.
- **Paso 3, zoom suavizado y prioridad por intención.** La rueda fija un zoom objetivo con interpolación de unos 250 ms, manteniendo el punto bajo el puntero como ancla. Durante un acercamiento, `SpriteLod` recibe el punto del mundo bajo el puntero y el zoom objetivo, calcula la vista de destino y encola sus chunks primero, aunque sea por debajo de 1.05, dentro del presupuesto de reposo.

**Fuera:** nivel intermedio de LOD, texturas comprimidas, decodificación en un worker, modo kiosko.

## Not Doing (and Why)
- **Service Worker o Cache Storage**: añade ciclo de vida, invalidación y dependencia del despliegue a cambio de persistir entre sesiones, que no es el problema que tenemos. El kiosko tiene conexión, así que tampoco lo necesita.
- **Decodificar o subir en segundo plano todo lo descargado**: no cabe en la VRAM y es justo lo que ya descartamos.
- **Nivel intermedio 1.6×**: duplica el export y complica el LOD. Solo se justificaría si el fundido no basta.
- **Decodificar en un worker (`createImageBitmap` y subida repartida entre frames)**: es la siguiente pieza si la medición dice que domina la CPU, pero no antes de tener el dato.
- **Fundido al volver a 1×**: pasa al alejar, cuando la diferencia no se ve.

## Decisiones tomadas
- **Zoom suavizado**: aceptado. La rueda deja de ser instantánea y pasa a una interpolación de ~250 ms.
- **Kiosko**: tiene conexión, así que la persistencia entre sesiones no es necesaria y los blobs en memoria bastan.
- **Fundido: descartado (2026-09-29).** Se implementó para los sprites de varios chunks y funcionaba, pero aporta poco. En zonas semitransparentes, como las sombras, se ve raro, porque mientras dura se ven a la vez la HD y el 1× y la zona se oscurece. Se revirtió y la variante para sprites de un chunk se canceló.
- **Añadido tras el Checkpoint A: subida sin tirones.** Se decodifica con `createImageBitmap` y hay un presupuesto de subida por frame, porque en el Mac de referencia había frames de 350–650 ms (ver `tasks/plan.md`).

## Resultado (2026-09-30)
En el Mac de referencia (MacBook Pro de 2012, Firefox 156), comparado con la línea base:

| hasta HD / peor frame | Antes | Después |
|---|---|---|
| Pádel | 2219 ms / 183 ms | 1190–1495 / 66–100 |
| Faro | 2706 / 349 | 1592–1770 / 66–67 |
| Mar | 4041 / 349 | 3122–3157 / 99–133 |

- **Lo que más aporta es la subida sin tirones** (`createImageBitmap` y 4 ms de subida por frame): los frames de 350 ms desaparecen.
- La precarga y la intención de zoom adelantan la HD un poco más, sobre todo con mala conexión.
- **El presupuesto HD por defecto baja de 768 a 384 MB:** con 768, recorrer el mapa a zoom 2 en el Mac daba un tirón de 732 ms; con 384, de 116 ms.
- De paso se corrigió un fallo previo en los límites de la cámara con zoom: no se llegaba a todos los bordes del mapa.
- Pruebas a mano correctas: sensación del zoom, bordes y sin halos en Firefox.

## Open Questions
- Ninguna bloqueante. Tras el paso 0 hay que decidir si se añade la decodificación en un worker.
