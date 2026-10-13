# Entrega del selector de cuentas de Google

Publicado el 12 de octubre de 2026, hora de Colombia. El inicio de sesión y la
vinculación con Google solicitan `prompt=select_account` para permitir elegir
qué cuenta usar, incluso cuando el navegador conserva una sesión anterior.

Fuente publicada: `4e5a7693eb6fae17387cbdb8b0ae0c902c672ec4`.
[Security CI 38341708284](https://github.com/happy-circles/Happy-circles/actions/runs/38341708284) pasó para ese commit, incluyendo
lint, tipos, pruebas, auditoría de dependencias, compatibilidad OTA, build de
landing, seguridad y suite SQL. Las pruebas locales aprobaron 1.234 casos en
159 archivos. La revalidación mantiene la comprobación de identidad esperada.

## Publicación

Runtime `hc-sdk54-20260928-1`, environment production. Se conservan los
builds compatibles 1.0.3 de Android e iOS. No hay diferencias nativas frente a
la fuente de esos builds, `3a6b8d15a54e7a59897114055e591322d2ed8c32`.
Este cambio no requiere otro binario de tienda ni cambios en Supabase.

| Canal | Plataforma | Update ID | Group ID |
| --- | --- | --- | --- |
| production-smoke | android | `01a13352-a3f8-7c36-b18f-4f892a5ae6dc` | `7f2afda4-3536-4e5b-b5f6-c4e2053792fe` |
| production | android | `01a13355-16c5-7ae5-9368-a722eb25d422` | `4fdf461c-25b8-4c32-b874-74e6f1c72ea5` |
| production | ios | `01a13359-610b-7a50-91b3-7fbf12b82b4b` | `ed7b3ac3-4b68-435f-a027-315567275da1` |

Se publicó primero en el canal del APK de pruebas y se verificaron su
manifiesto y bundle antes de publicar producción. Preview no tenía variables
Supabase ni builds terminados compatibles. La cuenta de GitHub disponible
para la API rechazó el dispatch manual con HTTP403; la publicación se
completó con la sesión EAS existente y CLI 21.7.1, conservando las comprobaciones
del commit limpio en main, CI del mismo SHA, entorno real, runtime y cuota Free.
No se cambiaron credenciales, permisos ni workflows.

## Verificación y recepción

EAS y sus canales confirman el mismo SHA para ambas plataformas de producción.
Los manifiestos y bundles descargados desde el CDN coinciden por SHA256 con
los exports, contienen la solicitud del selector y usan el backend previsto.
Las claves públicas de los manifiestos fueron aceptadas por Supabase; no se
hallaron credenciales de servidor ni referencias al backend de pruebas.

La comprobación pública del endpoint OAuth de producción respondió HTTP302
hacia accounts.google.com y conservó `prompt=select_account`. No se siguió
la redirección a Google ni se guardaron state, cookies o credenciales.
Esta prueba verifica el envío del parámetro; no verifica la pantalla del
selector ni completa un login con una cuenta real en un teléfono físico.

La app descarga la OTA al abrir con red y la aplica en un inicio posterior.
El [recibo de entrega](verification/google-account-selector-release-20261012.json)
conserva IDs, hashes y límites de la evidencia. Los exports y recibos locales
están en `.tmp/google-account-selector-release-20261012`.
