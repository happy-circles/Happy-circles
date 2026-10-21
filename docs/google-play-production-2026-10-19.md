# Preparación de producción en Google Play

Fecha: 19 de octubre de 2026, America/Bogota.

## Candidata

Happy Circles `com.happycircles.app`, **1.0.3 (24)**, preparada desde
`4f9d193ca93c77921c302537eb2510ed704633d5`, que coincidía con `origin/main`
al iniciar la compilación. Incorpora desde la instalación las mejoras de
contactos, rapidez, reintentos financieros e aislamiento entre cuentas
entregadas después del binario 23.

- [Build EAS](https://expo.dev/accounts/happy-circles/projects/happy-circles/builds/ba34fb7e-30bc-43d9-84ca-14cb2044d719):
  `FINISHED`, perfil y canal `production`, distribución de tienda.
- Runtime: `hc-sdk54-20260928-1`. La huella nativa
  `54faeca3f7f40f5366285a120bf6d52227089c2e` coincide con la del binario 23.
- AAB: `.tmp/play-production/2026-10-19/happy-circles-1.0.3-24.aab`,
  81.134.489 bytes, fuera del versionado Git.
- SHA256: `09e659d095ec8fffaaab5e6f35865b6c7dc698f5ce2a466407fa6e028b3bc0e6`.

## Verificación

[Security CI 38466255032](https://github.com/happy-circles/Happy-circles/actions/runs/38466255032)
pasó para el commit exacto de la candidata: lint, tipos, tests, auditoría de
dependencias, configuración EAS, build web, seguridad y pruebas Supabase.

El AAB generado pasó `bundletool validate` y la verificación de firma con
`jarsigner`. El certificado de carga coincide con el registrado anteriormente.
Se verificaron package, versión, código 24, target SDK 36, modo no depurable,
bundle incorporado, runtime y canal de actualizaciones de producción.
`READ_CONTACTS` está presente; `WRITE_CONTACTS`, `RECORD_AUDIO` y `AD_ID`
están ausentes. La configuración del bundle usa `PAGE_ALIGNMENT_16K` y las
48 bibliotecas de 64 bits tienen segmentos ELF LOAD alineados a 16 KB.
También se comprobó que RELRO no invade datos que deban seguir siendo escribibles.
Esto verifica el empaquetado; no sustituye una ejecución en un dispositivo de 16 KB.

Las rutas públicas `/privacy`, `/support`, `/terms` y
`/.well-known/assetlinks.json` respondieron 200. La asociación Android incluye
`com.happycircles.app` y el certificado de Play App Signing.

La cuenta EAS sigue en Free, con cuota Android disponible y coste estimado cero
antes de generar la candidata. No se contrataron extras.

El perfil de envío nuevo `play-production` en `apps/mobile/eas.json` apunta
a `production`, con `releaseStatus=draft` y `changesNotSentForReview=true`.
El perfil anterior `production` conserva el envío a pruebas `alpha`.
La configuración pasó `pnpm check:eas-update` (siete pruebas) y Prettier.

## Google Play

La consola confirma acceso a producción aprobado, ningún problema de políticas
y diez declaraciones completadas, sin tareas pendientes. Se guardó Colombia
como país del lanzamiento.

Se creó el borrador de producción con el nombre
`1.0.3 (24) — lanzamiento en Colombia` y estas notas `es-419`:

> Primera versión pública de Happy Circles. Organiza saldos y solicitudes con
> personas de confianza, invita contactos y consulta tu historial. Incluye
> mejoras en el inicio de sesión, la sincronización y la rapidez, además de
> mayor protección al reintentar operaciones.

Google procesó y aceptó el AAB `24 (1.0.3)`. La vista previa mostró cero errores
bloqueantes y una advertencia por falta de archivo de desofuscación R8/ProGuard.
Los símbolos de depuración nativos sí están adjuntos. Se guardó la versión
desde la vista previa: quedaron preparados dos cambios, la versión y la
incorporación de Colombia.

Después de la autorización explícita del titular, se ejecutó **Enviar 2 cambios
a revisión** y se confirmó **Envía cambios a revisión**. La consola muestra
ahora ambos elementos en **Cambios en la etapa de revisión**, sin un botón de
envío pendiente. En el momento del envío estaban en curso las verificaciones
rápidas automáticas de Google, previas a la revisión.

Seguimiento del 20 de octubre de 2026, 11:06 America/Bogota: se verificó la
sesión `happy.circles.pds@gmail.com`. La consola ya muestra **Tus cambios están
en proceso de revisión** para los dos cambios, sin verificaciones rápidas en
curso. La versión 1.0.3 (24) sigue pendiente de aprobación; no se confirma
publicación pública. La publicación administrada continúa desactivada y el
seguimiento permanece activo, sin aviso adicional al usuario mientras espera
la decisión de Google. Evidencia:
`.tmp/play-production/2026-10-19/google-play-in-review-20261020-1606.jpg`.

Consulta manual posterior del 20 de octubre de 2026: la sesión correcta sigue
mostrando los dos cambios en revisión. El canal de producción aparece
**Activo**, pero identifica expresamente **Versión 1.0.3 (24) — lanzamiento en
Colombia en revisión**; esa activación del segmento no demuestra aprobación
ni publicación. La ficha pública con `gl=CO` devuelve **No se ha encontrado**.
No hay aprobación ni disponibilidad pública confirmadas y el seguimiento
permanece activo. Evidencias:
`.tmp/play-production/2026-10-19/google-play-manual-status-20261020.jpg`,
`.tmp/play-production/2026-10-19/google-play-production-track-status-20261020.jpg`
y `.tmp/play-production/2026-10-19/google-play-public-co-not-found-20261020.jpg`.

El [recibo de preparación](verification/google-play-production-20261019.json)
conserva la fuente, CI, huella, hash y límites de las comprobaciones.
La evidencia visual está en
`.tmp/play-production/2026-10-19/google-play-production-prepared.jpg` y
`.tmp/play-production/2026-10-19/google-play-production-submitted.jpg`.

La publicación administrada sigue desactivada. El titular autorizó expresamente
el lanzamiento público tras la aprobación de Google; se conserva la publicación
automática, sin otro paso manual de publicación.

Última revisión automática: 21 de octubre de 2026 a las 11:30 America/Bogota.
La sesión autorizada confirma que los dos cambios siguen en revisión, sin
aprobación ni rechazo. No hay novedad accionable y no se emite otro aviso.
El seguimiento permanece activo. Evidencia:
`.tmp/play-production/2026-10-19/google-play-in-review-20261021-1630.jpg`.

## Límites de validación

No se ejecutó una nueva prueba autenticada en Android físico con el binario 24.
Las pruebas previas de recepción y arranque online/offline de la OTA compatible
están documentadas en `financial-integrity-release-20261013.md`; no equivalen
a QA autenticada en un teléfono físico. Antes del lanzamiento conviene confirmar
inicio de sesión con Google, invitación, solicitud y confirmación en un Android
de QA, sin crear movimientos de prueba en cuentas reales de producción.

El panel de pruebas mostraba avisos preventivos sobre optimización DEX
(fecha indicada: febrero de 2027), APIs de borde a borde y orientación en
pantallas grandes para el binario 23. No se alteró la configuración nativa
para atender esos avisos durante esta preparación.
