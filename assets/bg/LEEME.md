# Fondos (pendientes)

Los genera Jorge con el generador de imágenes y los convierte Claude a paleta limitada. Hasta que estén, el sótano se dibuja con tiles planos de `assets/ui/palette.json` y la fachada con un plano de color `verde_porton`.

| Archivo | Qué es | Tamaño | Uso |
| --- | --- | --- | --- |
| `01-fachada.png` | Fachada de la casa del Buitre con el portón verde del garaje, de día, sin coche ni personas. | 270×480 (vertical); versión `01-fachada-h.png` 480×270 | Inicio y llegada de cada capítulo. El coche (Pajero o Accord) y los personajes se dibujan encima. |
| `02-sotano.png` | El sótano vacío visto desde arriba con inclinación (como Unpacking): zonas 1–7 del plano y el rincón de las cacharras, sin muebles. Techo blanco, paredes de cal, terrazo, la rampa con el portón al fondo, el naranjo en el patio. | ~640×400, se recorta con la cámara | El tablero. Sustituye a los tiles. |
| `03-cuartillo-candado.png` | La puerta del cuartillo cerrada con candado, misma inclinación. | Lo que ocupe la puerta en el 02 | Capa sobre el 02 desde el capítulo 5. |
| `04-desde-escalera.png` | El sótano visto desde el último peldaño, con los muebles del final del juego. | 270×480 y 480×270 | Última imagen, créditos. |
| `coche-pajero.png` | Mitsubishi Pajero verde visto desde arriba con la misma inclinación. | ~96×48 | Garaje, capítulos 1, 2, 3, 5 y 8. |
| `coche-accord.png` | Honda Accord gris, igual. | ~96×48 | Garaje, capítulos 4, 6, 7; rampa en el 8. |

Prompts sugeridos para el generador (fondo verde #00FF00 donde haya transparencia; sin texto, sin personajes, vista consistente):

- Fachada: `Pixel art, Game Boy Advance style, vertical 9:16, daytime, front view of a modest two-storey Andalusian house in a village street, white walls, a big green metal garage gate on the ground floor leading down to a basement, an orange tree visible over a low wall on the left, no people, no cars, no text, flat shading, limited palette.`
- Sótano: `Pixel art, Game Boy Advance style, top-down room view with slight tilt like the game Unpacking (back walls seen frontally, floor in plan), an empty Spanish basement: white limewashed walls, grey terrazzo floor, on the left an open-air striped concrete ramp with plants and vines on both sides coming down from a green garage gate at the top-left to a dirt corner with an orange tree at the bottom-left, a wall with two doors separating the ramp from the indoor part, inside: an empty garage bay at the bottom center, a staircase going up at the bottom-right, a cluttered corner with old truck parts beside the stairs, a living area at the top center, a small side room with a door at the top-right, no furniture, no people, no text, flat shading, limited palette.`
- Coches: `Pixel art sprite, top-down with slight tilt, a green 1990s Mitsubishi Pajero SUV [/ a grey Honda Accord sedan], plain solid flat background #00FF00, no text.`
