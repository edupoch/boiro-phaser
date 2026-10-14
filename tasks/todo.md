# Todo: oleaje en la orilla

Plan: `tasks/plan.md` · Idea: `docs/ideas/oleaje-orilla.md`

## Fase 1: El agua respira
- [x] T1: `oleaje(t)` con tests y escalado de `orilla` y `hoyo_mar` desde el pivote, con `window.__oleaje` para ajustar (S). Pivote cambiado a (2426, 3500), dentro del agua: el de la diagonal hacía asomar la punta sobre la arena
- [ ] **Checkpoint 1 (Mac)**: HD sincronizada, fps, amplitud elegida y revisión humana

## Fase 2: La espuma va detrás
- [ ] T2: `mar` y `hoyo_orilla` con `oleaje(t − RETRASO_MS)`; comprobar en el pico que la espuma no asoma por la esquina del muro (XS)

## Fase 3: Cada ola distinta
- [ ] T3: Amplitud por ciclo con un hash determinista de `k`, ±20 %, con tests de continuidad (XS)
- [ ] **Checkpoint 2**: tests, build y e2e en verde; Mac (y kiosko); idea actualizada; revisión humana
