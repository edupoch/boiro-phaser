# Todo: precarga y transición suave de la HD

Plan: `tasks/plan.md` · Spec: `docs/ideas/precarga-hd.md`

## Fase 1: Medición
- [x] T1: Métricas de latencia HD (red, subida, tiempo hasta HD completa, peor frame) y `__lodBench` en DEV (S)
- [x] **Checkpoint A**: tabla de línea base (pádel, faro, mar × local, Regular 4G / LTE, Mac de referencia con Firefox), validar el presupuesto de memoria en el Mac y decidir el orden

## Fase 2: Quitar la red y los tirones
- [x] T2: `HdBlobStore`, descarga en segundo plano de los 30 MB como blobs (M)
- [x] T2b: Subida sin tirones: `createImageBitmap` y como mucho N subidas por frame (M), depende de T2 (pendiente de validar en el Mac)
- [~] ~~T3: Fundido de entrada para sprites de varios chunks~~: descartada y revertida (en las sombras semitransparentes se ve raro)
- [~] ~~T4: Fundido de entrada para sprites de un chunk~~: cancelada
- [ ] **Checkpoint B**: benchmark frente a la línea base y revisión visual en el Mac de referencia

## Fase 3: Empezar antes
- [x] T5: Zoom suavizado con la rueda, ~250 ms (S); corrige además los límites de scroll con zoom (pendiente de probar la sensación en equipos reales)
- [x] T6: Prioridad por intención de zoom con `setZoomIntent` (M); también por debajo de 1,05, con la vista del umbral
- [ ] **Checkpoint C**: tabla final, prueba en el Mac de referencia y en el kiosko, actualizar la spec y revisar antes del commit
