# Mecánicas de xogo: modo xogo e modo exploración

## Problem Statement
¿Cómo podríamos conseguir que quien pasa por el kiosko del stand se vaya sabiendo qué fabrica cada empresa (Rotogal, Egalsa, JJ Chicolino, Oziona), habiéndolo descubierto con sus propias manos en el mapa?

**Contexto:** kiosko en un stand o feria, con pantalla compartida y sesiones cortas. **Éxito:** que la gente recuerde las empresas.

## Recommended Direction
Habrá dos modos sobre el mismo mapa. El **modo xogo** tiene 3 niveles: tipos explícitos, pistas y una empresa. Comparten intentos y tienen un tope de unidades por objetivo para que una partida dure pocos minutos. El **modo exploración** muestra la ficha de cualquier objeto que tenga contenido. En todas las fichas aparece "Fabricado por" con una etiqueta del color de la empresa, que es lo que une todo el aprendizaje. El juego termina con un resumen por empresa de lo que se ha encontrado.

La base es un **catálogo único** (`ob_id → nome, empresa, titular, texto`, más las empresas con su color y las pistas como `texto → ob_ids`) y un **`GAME_CONFIG`** con todos los números. Solo son objetivo los `ob_*` que tengan ficha. Los demás son **señuelos**: en el juego cuentan como error y en exploración no se pueden pulsar hasta que tengan contenido. Así, añadir un objeto nuevo es añadir una entrada al catálogo y nada más.

Como es un kiosko, al cabo de un rato sin actividad aparece el aviso "Segues aí?" y luego se vuelve a Inicio con la partida limpia. Cada visitante empieza de cero sin que el personal tenga que hacer nada.

## Decisiones
- **Error:** solo pulsar un `ob_*` que no es objetivo, incluidos los señuelos. Pulsar en el vacío o un objeto ya encontrado no penaliza.
- **Pistas que se solapan:** un clic cuenta para todas las pistas que incluyen ese objeto.
- **Intentos:** se arrastran entre niveles. Los objetivos de cada nivel empiezan de cero.
- **Titular de la ficha:** la exclamación propia de cada objeto ("Que crack!", "Boa vista!"…), separada del texto. En el último objeto de un nivel, "Completaches o nivel!".
- **Relación de sprites y fichas:**

  | `ob_*` | Ficha | Empresa |
  |---|---|---|
  | `ob_contenedor` | Contedores | Rotogal |
  | `ob_carro` | Carro cutter | Rotogal |
  | `ob_pale_plastico`, `ob_pale_porex` | Pallets | Rotogal |
  | `ob_newjersey` | Barreiras viais | Rotogal |
  | `ob_caja_madera` | Caixas de madeira | Egalsa |
  | `ob_malla_limones`, `ob_malla_naranjas` | Mallas | Egalsa |
  | `ob_saco_malla` | Sacos | JJ Chicolino |
  | `ob_boya`, `ob_boya_amarilla` | Boias | JJ Chicolino |
  | `ob_ancla` | Áncoras | JJ Chicolino |
  | `ob_cuerda` | Corda de cultivo | JJ Chicolino |
  | `ob_banco_jardinera`, `ob_banco_ola` | Bancos | Oziona |
  | `ob_papelera` | Papeleiras | Oziona |
  | `ob_fuente` | Fontes | Oziona |
  | `ob_canodromo` | Parque canino | Oziona |

  Señuelos (sin ficha por ahora): alcantarilla, bigbag, bolardo, botas, caja_plastico, caja_porex_*, cono, cubo, cupula, faro, macetero, pala, panel_porex.
- **Colores de empresa,** sacados de `escena.svg` (es una propuesta; falta comprobar el contraste con texto blanco):
  Rotogal `#ea580c` · Egalsa `#2e6777` · JJ Chicolino `#0369a1` · Oziona `#65a30d`.

## GAME_CONFIG (valores por defecto)
| Parámetro | Valor |
|---|---|
| `nivel1Tipos` (X) | 2 |
| `nivel2Pistas` (Y) | 2 |
| `maxPorObxectivo` | 3 |
| `intentos` | 5 |
| `nivel3MinObxectos` | 3 |
| `inactividadeSegundos` | 90 |

## Key Assumptions to Validate
- [ ] **Una partida completa dura 3–5 minutos.** *Prueba:* cronometrar a 5 personas con los valores por defecto y ajustar X, Y y el tope.
- [ ] **La gente recuerda al menos 2 empresas al terminar.** *Prueba:* preguntar a la salida "¿qué hace Egalsa?".
- [ ] **Con una sola empresa, el nivel 3 está equilibrado** (Egalsa ≈ 3 objetos, Oziona ≈ 8). *Prueba:* comparar el tiempo y los errores según la empresa que toque. Si no está equilibrado, subir `nivel3MinObxectos` o pasar a varias empresas.
- [ ] **Las pistas se entienden sin ayuda.** *Prueba:* observar si la gente se queda bloqueada en el nivel 2.
- [ ] **Los señuelos como error se sienten justos.** *Prueba:* observar reacciones al primer "Obxecto incorrecto!".

## MVP Scope
**Dentro:**
- `catalogo.ts` con las fichas de `docs/content/objetos.md` limpias (sin "Atopáchelo"/"Sabías que" y con la frase inicial pasada al campo `titular`), las empresas con su color y las pistas jugables con la escena actual (*froita*, *almacén*, *mar*). Mientras no haya más pistas, Y ≤ 3.
- `GAME_CONFIG` con los valores de arriba.
- La máquina de estados del juego: nivel, objetivos, intentos y errores totales.
- Los modales: ficha, ficha de fin de nivel ("Pasar ao nivel N"), incorrecto ("Quédanche N intentos"), perdiste ("Perdiches!", "Esgotaches todos os intentos"), resumen final por empresa ("Completaches o xogo con 1 erro / N erros!", "Xa sabes máis da nosa empresa ca nós :)") y confirmación ("Seguro? …", Si/Non).
- La HUD: Inicio (con "Comecemos!" o "Continuar xogando / Reiniciar xogo"), "Xogo N/3", Exploración y Axustes con 3 sliders (ambiente = `praia`; efectos = hover, clic, éxito y error, tanto en Phaser como en el `new Audio()` de la HUD; música sin conectar). Los volúmenes se guardan en `localStorage`.
- El reinicio por inactividad, que vuelve a Inicio sin tocar los volúmenes.

## Not Doing (and Why)
- **Nivel 3 con varias empresas.** Se decidió una sola. Se puede retomar si la prueba de equilibrio sale mal.
- **Álbum o contador en exploración.** En un kiosko no da tiempo a coleccionar.
- **Añadir sprites `ob_` nuevos** (kayaks, batea, cabos…). Se ajusta a la escena actual; el catálogo deja la puerta abierta.
- **Guardar la partida entre sesiones.** Es un kiosko: cada visitante empieza de cero.
- **Fichas para los señuelos.** Llegarán con el contenido nuevo.
- **Música.** El slider existe pero no está conectado.
- **Pistas de ayuda o hints.** Solo si la prueba demuestra que hacen falta.

## Pendiente (contenido, no bloquea)
- Fichas y pistas nuevas: pendientes de redactar. Pistas sugeridas que faltan: Oziona ("onde descansar e beber nun paseo" → bancos, fonte, papeleira) y sacos de JJ Chicolino.
- Erratas del enunciado ya resueltas en esta especificación: "Esgotaches", "Reiniciar xogo" y el segundo modal, que es el del objeto *incorrecto*.
