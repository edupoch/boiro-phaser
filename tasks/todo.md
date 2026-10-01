# Todo: mecánicas de xogo

Plan: `tasks/plan.md` · Spec: `SPEC.md` · Idea: `docs/ideas/mecanicas-xogo.md`

## Fase 1: Cimientos
- [x] T1: Catálogo, `GAME_CONFIG`, textos y Vitest, con test de integridad contra el atlas (M)
- [x] T2: `gameReducer` puro con PRNG con semilla, las reglas de los 3 niveles y tests (M)
- [x] T3: Toque frente a arrastre en `GameScene` (S), en paralelo con T1 y T2 (comprobada con clics reales en Chromium)
- [ ] **Checkpoint 1**: tests y tsc en verde, revisión humana de los textos del catálogo

## Fase 2: Juego jugable
- [x] Extra (descubierto en T4): `split.js` exporta los grupos `ob_*` de la raíz del SVG como un solo sprite (el saco y una papeleira no se podían pulsar); atlas regenerado
- [x] T4: Recorrido de acierto de los 3 niveles: `useReducer`, `Hud.tsx`, `FichaModal.tsx` y se borran `GameState.ts` y `ObjectFoundModal.tsx` (M)
- [x] T5: Errores, derrota y final con resumen por empresa: `MessageModal.tsx` (M)
- [x] T6: Modos, pestañas, confirmaciones A y B, y señuelos según el modo (M)
- [ ] **Checkpoint 2**: juego completo sin audio ni inactividad, y partida cronometrada

## Fase 3: Kiosko
- [x] T7: Audio: `audioSettings.ts`, sliders de Axustes y volúmenes en Phaser y en la HUD (M)
- [x] T8: Reinicio por inactividad con "Segues aí?" y vuelta a la cámara inicial (M)
- [x] Extra: pruebas de navegador en `e2e/` (`npm run test:e2e`); destaparon que un clic sobre una confirmación llegaba al objeto de debajo (corregido)
- [~] **Checkpoint 3**: criterios de éxito y docs actualizados; **pendiente: prueba en el Mac de referencia (y en el kiosko)**
