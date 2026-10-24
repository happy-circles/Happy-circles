# Campo OTP con pegado nativo, 2026-10-23

Estado: **Publicada y verificada en iOS y Android**.

Se retira el botón adicional **Pegar** de las pantallas de confirmación y
recuperación. El campo conserva el cursor y la selección nativos, la
normalización a ocho dígitos y las indicaciones de AutoFill. Un solo input
cubre toda la fila de casillas; el pegado se realiza desde el propio campo.

El cambio de interfaz usa JavaScript compatible con los binarios existentes.
La preparación también corrige dependencias del landing y de las herramientas,
e incorpora un backport de Zod en el código JavaScript de ejecución. Se conservan
el runtime nativo y los módulos nativos móviles. La entrega no incluye cambios
de correo, configuración Auth o nuevos builds de tienda.

## Fuente y distribución

- Commit de la corrección de UI: `af3d3a291de0336d070b6129ce41241e91fffe9b`.
- Fuente final distribuida: `6f855eeb6dfc74575756ea51f2ca9bd0afc69c5a`.
- [Security CI 40044433755](https://github.com/happy-circles/Happy-circles/actions/runs/40044433755): **ÉXITO**.
- Versión visible: `1.0.3`.
- Runtime: `hc-sdk54-20260928-1`.
- Canal y environment: `production`.
- Recibo sanitizado: [otp-native-paste-only-20261023.json](verification/otp-native-paste-only-20261023.json).

| Plataforma | Grupo OTA                              | Update servido                         | Verificación                     |
| ---------- | -------------------------------------- | -------------------------------------- | -------------------------------- |
| iOS        | `de1046b4-af15-459f-b79f-16b71083e781` | `01a16b4d-4022-728c-bbd5-9d4d2ddc48ee` | `HTTP 200 y SHA-256 coincidente` |
| Android    | `5586850b-0e73-49a2-a4e8-b2457a63b6e5` | `01a16b4e-93e8-76d9-9e73-e6d42e486340` | `HTTP 200 y SHA-256 coincidente` |

La consulta de uso previa del 23 de octubre a las 19:08 Bogotá confirmó plan
EAS Free, sin extras ni cargos estimados: 24/1000 usuarios OTA y
220.599.416/107.374.182.400 bytes de transferencia.

## Dependencias y herramientas

| Paquete  | Versión anterior | Versión preparada      | Ámbito                                |
| -------- | ---------------- | ---------------------- | ------------------------------------- |
| Next     | `16.3.8`         | `16.4.1`               | Landing y sus paquetes acompañantes   |
| Vitest   | `4.1.11`         | `4.1.12`               | Suite de pruebas                      |
| fast-uri | `3.1.8`          | `3.1.9`                | Dependencia transitiva de validación  |
| undici   | `6.28.1`         | `6.29.1`               | Cliente HTTP de las herramientas      |
| Zod      | `3.25.76`        | `3.25.76` con backport | Validación en JavaScript de ejecución |

El lockfile registra esas versiones y sus paquetes acompañantes. El backport
de Zod rechaza temprano colecciones que superan su cota de tamaño y mantiene
la API de Zod 3. Su [parche](../patches/zod@3.25.76.patch) tiene SHA-256
`1772269535a14b98546c7b7dffadc25f638255659d73ba7450e816325f6f028e`.

La auditoría local pasó: cinco avisos upstream están cubiertos por parches
verificables, y la suite de regresiones de dependencias pasó sus 21 pruebas.
El [registro de seguridad](dependency-security-2026-09.md) documenta versiones,
alcance, condiciones de aceptación y referencias upstream. Zod modifica
JavaScript incluido en la aplicación; los otros cambios afectan el landing
y las herramientas. Ninguno cambia el runtime nativo ni sus módulos.

## Comprobaciones

La prueba web con autenticación simulada confirmó ausencia del botón extra,
un único input que cubre la fila, `autocomplete=one-time-code` y ausencia de
`maxlength` nativo. Pegar el texto de prueba `01 23\n45 67` llena las ocho
casillas y conserva el cero inicial.

Se conservan `textContentType=oneTimeCode` en iOS y `autoComplete=one-time-code`
en Android/web. La longitud se limita después de limpiar el texto pegado.

También pasaron localmente 1.432 pruebas de aplicación en 177 archivos,
tipos, build del landing, controles de seguridad y comprobación de configuración
EAS. Security CI también pasó sobre la fuente exacta, con 45 comprobaciones SQL en 36 archivos.

La recepción de esta OTA, el menú de pegado y la sugerencia de teclado siguen
pendientes de observar en un iPhone físico. Una prueba web o un manifiesto
publicado no demuestra ese comportamiento en el teléfono.

El [seguimiento del 21 de octubre](otp-paste-follow-up-2026-10-21.md) conserva
la entrega anterior con botón explícito y la verificación histórica de correo.
No se enviaron correos nuevos como parte de este cambio de interfaz.
