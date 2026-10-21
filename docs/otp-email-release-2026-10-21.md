# Códigos de correo y actualización móvil, 2026-10-21

Este registro conserva la primera entrega. La
[corrección posterior de pegado y notificaciones](otp-paste-follow-up-2026-10-21.md)
desde `d5814ac6` la reemplaza en el canal production y aclara el soporte de iOS 26.

La corrección del campo de ocho dígitos está publicada por OTA en Android e
iOS. El campo nativo ocupa toda la fila para permitir el menú de pegado;
conserva `oneTimeCode`, validación, accesibilidad y estados deshabilitados.
Las plantillas de confirmación y recuperación muestran el código continuo,
sin dividir los dígitos en celdas. Bienvenida está activa y alineada con la fuente.

## Fuente y distribución

- Commit publicado: `256f0064f2dc8b4011677db72b98179ce7903575`.
- Canal y environment: `production`; rama EAS `production`.
- Runtime: `hc-sdk54-20260928-1`; versión visible `1.0.3`.
- Proyecto EAS: `9b63f5f3-3c81-4d3d-bc54-1a81b998d20a`.
- Backend: `vknfhyfdtlvvfzptpqpj`; origen `https://app.happy-circles.com`.
- Sin dependencias nativas nuevas ni builds de tienda nuevos. Los binarios
  compatibles existentes reciben la actualización al arrancar con red y la
  aplican en un arranque posterior. Abrir, dejar descargar, cerrar y abrir otra vez.

| Plataforma | Grupo OTA                              | Update servido                         | Publicado (UTC) |
| ---------- | -------------------------------------- | -------------------------------------- | --------------- |
| Android    | `9e8a0007-7165-4550-a1ff-49d4edcbb8a0` | `01a15ff9-7266-76db-a024-3a4aa58f0d40` | 19:39:05        |
| iOS        | `6d293953-63d7-4efe-a0d2-e0c18edbe83c` | `01a15ffc-4093-73f7-a91a-dea18adf4e55` | 19:42:09        |

Se publicó con EAS CLI `21.7.1` y la sesión existente, porque la credencial
GitHub disponible permite lectura y la sesión web no ofrece despachar el
workflow. Se conservaron las guardas del workflow: `main`, origen y árbol
limpios, CI exitoso para ese SHA, runtime y environment comprobados, `.env`
local desactivado y exportación nueva de cada plataforma usando producción.
La metadata EAS confirma el mismo SHA y `isGitWorkingTreeDirty=false`.

Antes de publicar se revisó EAS: plan Free, sin extras, estimación y excedentes
cero, 22/1000 usuarios OTA y 192 MiB/100 GiB de transferencia. No se contrataron
servicios ni se cambiaron permisos.

## Comprobaciones

[Security CI del código publicado](https://github.com/happy-circles/Happy-circles/actions/runs/39662546738)
terminó correctamente: lint, tipos, 1.428 pruebas en 176 archivos, auditoría,
configuración OTA, build web, controles de seguridad y 36 archivos SQL con
45 comprobaciones. La auditoría ejecuta además 11 regresiones de seguridad.
Vite pasó de `6.4.3` a `6.4.4` para corregir cinco avisos nuevos; solo afecta
herramientas de Vitest. El importer móvil y las dependencias nativas no cambiaron.
Se conservaron las cinco excepciones anteriores con sus parches verificados.
[Release oficial de Vite](https://github.com/vitejs/vite/releases/tag/v6.4.4).

Los dos manifiestos de `production` devolvieron HTTP 200, el update de su
plataforma y el runtime/backend esperados. Cada bundle devolvió HTTP 200 y su
SHA-256 coincidió con el manifiesto, siguiendo el
[protocolo Expo Updates](https://docs.expo.dev/technical-specs/expo-updates-1/).
El [recibo JSON](verification/otp-email-release-20261021.json) conserva IDs y hashes.

## Correo en producción

Las dos plantillas Auth se comprobaron por lectura remota a las 19:36 UTC
y se confirmaron nuevamente a las 19:41 UTC después de alinear bienvenida:
idénticas al repositorio, `{{ .Token }}` continuo, OTP de ocho dígitos y enlaces
`{{ .ConfirmationURL }}` conservados. El cambio de HTML ya se había aplicado
a las 17:08 UTC y una recuperación llegó a Gmail inbox con SPF/DKIM correctos.

`send-welcome-email` se alineó a v6 `ACTIVE` a las 19:40:51 UTC, con JWT
habilitado. Todos los archivos de ejecución recuperados coinciden exactamente
con los blobs de `256f0064`. El cambio de helper solo mejora la clasificación
de errores; no modifica envío, HTML o control de envío único. Se conservaron
secrets, plantillas y configuración Auth. No se hicieron migraciones ni envíos
nuevos durante esta alineación. La prueba anterior de bienvenida llegó a Gmail;
fue un envío separado y no una prueba de onboarding con una cuenta nueva.

## Comprobación pendiente en dispositivo

Pasaron la prueba de pegado de ocho dígitos en navegador y la comprobación del
área del input. Todavía falta comprobar recepción/aplicación de la OTA en los
dispositivos instalados, menú Pegar en iPhone y arranque sin conexión después
de descargarla. La sugerencia de códigos desde Gmail sobre el teclado iOS no
se da por validada. La documentación de Apple citada en
[Auth Email Setup](auth-email-setup.md) describe códigos recibidos en Apple Mail.

La validación EAS preview encontró que faltan sus variables públicas de
Supabase; no se sustituyeron por las de producción. Se documenta este límite:
no se completó distribución ni prueba en un build preview. Producción se
exportó y verificó con su environment real y el CI del mismo commit.
Los registros históricos de iOS y Google Play conservan los SHA y contadores
de sus binarios; esta OTA no los reemplaza ni vuelve a enviar a revisión.
