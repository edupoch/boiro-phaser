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
3. **Disimular lo que llegue tarde.** Fundido de ~200 ms de la HD sobre la 1×, en vez del `setTexture` seco.

Primero se mide, porque qué pieza importa más depende de si domina la red o la CPU/GPU.

## Key Assumptions to Validate
- [ ] **Qué fase domina el retraso.** Instrumentar `SpriteLod` con los tiempos desde la petición hasta `FILE_COMPLETE` y el coste de la subida a la GPU, y ampliar `getStats()`. Medir en local, con DevTools en "Slow 4G" y con la CPU ralentizada 4× y 6×.
- [ ] **La descarga en segundo plano no se nota al jugar.** Medir el frame time durante la descarga con la CPU ralentizada. La descarga se pausa mientras haya chunks pendientes bajo demanda.
- [ ] **Con los blobs precargados, el tiempo hasta la HD baja claramente con mala conexión.** Comparar antes y después con "Slow 4G".
- [ ] **El zoom suavizado deja margen suficiente.** Medir cuántos ms pasan entre el primer evento de rueda y el momento en que el zoom supera 1.6, frente a lo que tarda en estar lista la HD de la vista de destino.
- [ ] **El fundido se percibe mejor que el corte.** Comparación visual en el pádel, el faro (Container interactivo) y los árboles (animados).
- [ ] **30 MB de blobs en RAM son asumibles.** Comprobar la memoria de la pestaña en el equipo modesto.

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

## Open Questions
- Ninguna bloqueante. Tras el paso 0 hay que decidir si se añade la decodificación en un worker.
