# Google Play Console submission draft

Ultima revision: 2026-08-14.

Valores listos para completar Play Console para `com.happycircles.app`.

## Informacion base

- Nombre de la app: Happy Circles
- Paquete: `com.happycircles.app`
- Categoria recomendada: Finance
- Email de contacto: `soporte@happy-circles.com`
- Politica de privacidad: `https://app.happy-circles.com/privacy`
- Soporte y solicitudes de cuenta/datos: `https://app.happy-circles.com/support`
- Terminos: `https://app.happy-circles.com/terms`

## Acceso a la app

- La app requiere inicio de sesion: Si.
- Motivo: las funciones dependen de datos privados de cuenta, contactos de
  confianza, permisos de relacion y datos protegidos por autenticacion.
- Cuenta demo: usar `apple-review@happy-circles.com` si la contrasena vigente de
  App Store Connect queda verificada para produccion.
- Instrucciones para review:

```text
Happy Circles requires sign in because all app features depend on private
account data, trusted contacts, relationship permissions and protected balance
records. Use the provided demo account to access the main app flow.
```

## Anuncios

- Contiene anuncios: No.

## Ficha de Play Store

Descripcion corta:

```text
Organiza saldos privados con personas de confianza.
```

Descripcion completa:

```text
Happy Circles ayuda a organizar saldos privados entre personas de confianza.
Puedes registrar solicitudes, confirmar pendientes, invitar contactos y cerrar
cuentas compartidas con historial claro.

La app no es un banco, billetera, pasarela de pago, producto de credito ni
servicio de inversion. Happy Circles no mueve dinero, no desembolsa fondos, no
cobra intereses y no consulta puntajes crediticios. Solo ayuda a llevar un
registro privado y verificable entre usuarios que se conocen.

Funciones principales:
- Registro privado de solicitudes y saldos.
- Invitaciones entre personas de confianza.
- Historial y auditoria de cambios importantes.
- Cierre de cuentas compartidas.
- Proteccion de acciones sensibles con dispositivo confiable y biometria local.

La privacidad es parte central del producto. Puedes revisar la politica de
privacidad en https://app.happy-circles.com/privacy y solicitar soporte o
eliminacion de cuenta/datos en https://app.happy-circles.com/support.
```

## Seguridad de datos

Resumen para revisar contra el formulario de Play Console:

- La app cifra datos en transito: Si.
- El usuario puede solicitar eliminacion de datos: Si.
- La app vende datos: No.
- La app usa datos para publicidad o tracking: No.
- La app procesa pagos, tarjetas o cuentas bancarias: No.
- La app consulta buro/puntaje crediticio: No.
- La app usa ubicacion: No.

Datos esperados:

- Personal info: nombre, email, telefono e IDs de usuario.
- Contacts: contactos, opcional y activado por el usuario.
- Photos and videos: foto de perfil opcional.
- Financial info: saldos, solicitudes, ledger e historial privado.
- App activity: interacciones de producto para analitica y funcionamiento.
- App info and performance: diagnosticos y rendimiento.
- Device or other IDs: IDs de dispositivo/sesion para seguridad, push y
  analitica.

## Clasificacion de contenido

Postura recomendada:

- Sin violencia.
- Sin contenido sexual.
- Sin lenguaje ofensivo.
- Sin sustancias controladas.
- Sin apuestas.
- Sin compras dentro de la app, salvo que cambie el producto.
- Puede permitir interaccion entre usuarios conocidos dentro de la app.

## Prueba cerrada

Play Console exige antes de produccion:

- Crear una prueba cerrada.
- Seleccionar paises/regiones. Recomendado inicial: Colombia.
- Cargar un AAB de produccion.
- Tener al menos 12 testers que acepten participar.
- Mantener la prueba cerrada activa al menos 14 dias con esos testers.
- Luego solicitar acceso a produccion.

Estado historico observado en Play Console el 2026-08-11:

- Track de prueba cerrada: `Alpha`.
- Estado del segmento: `Activo`.
- Version enviada: `21 (1.0.1)`.
- AAB usado: `1.0.1 (21)`; no conservar artefactos de build dentro del repo.
- Pais/region seleccionado: Colombia.
- Lista de testers seleccionada: `Android_internal_testers`.
- Testers en la lista: 7.
- Enlaces para invitar testers:
  - Android: `https://play.google.com/store/apps/details?id=com.happycircles.app`
  - Web: `https://play.google.com/apps/testing/com.happycircles.app`
- Estado de publicacion: 13 cambios enviados a Google para revision. Play
  Console muestra "Tus cambios estan en proceso de revision".

Pendiente para pedir acceso a produccion:

- Volver a consultar el conteo aceptado actual. En la observacion del
  2026-08-11 faltaban al menos 5 testers para llegar a 12.
- Cuando la version quede aprobada/publicada en closed testing, enviar el enlace
  Web de opt-in a los testers y confirmar que acepten la prueba.
- Mantener la prueba cerrada activa al menos 14 dias con 12 testers aceptados.

## Verificacion de desarrolladores de Android

Revisado en Play Console el 2026-08-10:

- `Happy Circles` / `com.happycircles.app` aparece como `Registrada`.
- Play Console muestra 1 clave de firma vinculada al package.
- Ultima actualizacion visible: 2026-05-21.
- No se vio una tarea pendiente separada en la pestana "Identidad"; Play Console
  toma los datos legales de la cuenta de desarrollador.
- Mantener este punto en revision antes del 2026-09-30, pero no bloquea el
  submit actual al track `alpha`.

## Candidata Android 1.0.2

Estado preparado en repo el 2026-08-14:

- `versionName 1.0.2`, siguiente `versionCode` previsto `22`, target SDK 36.
- Expo SDK 54 alineado en `expo@54.0.36`.
- El perfil `apk` usa el EAS environment `production`, credenciales remotas,
  distribucion interna y no auto-incrementa. Solo sirve para el smoke final; no
  se carga a Play Console.
- El perfil `production` genera el AAB de tienda, usa versionado remoto y apunta
  al track `alpha` como draft.
- El workflow EAS exige `main`, `EXPO_TOKEN` y Security CI exitoso para el mismo
  commit. Android auto-submit falla cerrado mientras falte la service account.

Secuencia:

1. Generar e instalar el APK de smoke `1.0.2` contra produccion. Puede conservar
   el codigo remoto `21` porque no se carga a Play ni incrementa el contador.
2. Probar login, onboarding, recuperacion, trusted device, deep links, Google
   Sign-In y reapertura de sesion sin crear datos demo.
3. Verificar que Google OAuth Android contiene el SHA-1 de la firma EAS usada
   por el APK.
4. Generar el AAB `production`, cargarlo como draft y probar la instalacion desde
   Play; esa ruta debe usar el SHA-1 de Play App Signing.

Bloqueos tecnicos actuales:

- Falta configurar/asignar en EAS la Google Service Account Key con permisos de
  Play Store Submissions. La cuenta ya existe en Play Console, pero sin el JSON
  EAS no puede hacer `eas submit`.
- Falta verificar los dos SHA-1 OAuth Android: firma EAS y Play App Signing. Los
  SHA-256 publicados en `assetlinks.json` no sustituyen los SHA-1 OAuth.
- Falta completar el requisito de testers: al menos 12 aceptados durante 14
  dias; 7 fue solo el ultimo conteo historico del 2026-08-11.

## Historial tecnico

Estos registros explican lo ya enviado, pero no son artefactos de la candidata:

- AAB generado con EAS: build `8d476add-8025-46f1-8d7a-7f9cd5d0f19a`,
  `versionName 0.1.2`, `versionCode 20`.
- AAB subido manualmente a Play Console el 2026-08-11:
  `versionName 1.0.1`, `versionCode 21`.
- La version borrador anterior `13 (0.1.0)` fue removida de la version Alpha
  antes de enviar a revision.
- Usar credenciales de firma correctas de EAS/Play, no un build local firmado
  con debug keystore.
- En la revision local del 2026-08-10 no se encontro el JSON de Google Service
  Account.
  La key de Google que aparece en EAS es de FCM/push, no sirve para subir a Play
  y su private key no se puede recuperar desde EAS.
- Avance 2026-08-10: creada la service account
  `happy-circles-play-submit@happy-circles-493003.iam.gserviceaccount.com` y
  agregada en Play Console como usuario activo para `Happy Circles`
  (`com.happycircles.app`) con permisos de testing.
- Google Cloud genero descargas de key que no quedaron disponibles para EAS.
  Instalar una unica key vigente fuera del repositorio, cargarla en EAS y
  revocar las copias no controladas antes de `eas credentials --platform
android`.
