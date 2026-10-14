# Todo: oleaje en la orilla

Plan: `tasks/plan.md` · Idea: `docs/ideas/oleaje-orilla.md`

## Fase 1: El agua respira
- [ ] T1: `oleaje(t)` con tests y escalado de `orilla` y `hoyo_mar` desde el pivote (6815, 3680), con `window.__oleaje` para ajustar (S)
- [ ] **Checkpoint 1 (Mac)**: HD sincronizada, fps, amplitud elegida y revisión humana

## Fase 2: La espuma va detrás
- [ ] T2: `mar` y `hoyo_orilla` con `oleaje(t − RETRASO_MS)`; comprobar antes que el borde de `mar` es colineal con el pivote (XS)

## Fase 3: Cada ola distinta
- [ ] T3: Amplitud por ciclo con un hash determinista de `k`, ±20 %, con tests de continuidad (XS)
- [ ] **Checkpoint 2**: tests, build y e2e en verde; Mac (y kiosko); idea actualizada; revisión humana
