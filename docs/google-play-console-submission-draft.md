# Google Play Console submission draft

Ultima revision: 2026-08-11.

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

Estado en Play Console el 2026-08-11:

- Track de prueba cerrada: `Alpha`.
- Estado del segmento: `Activo`.
- Version enviada: `21 (1.0.1)`.
- AAB usado: `apps/mobile/happy-circles-1.0.1-21.aab`.
- Pais/region seleccionado: Colombia.
- Lista de testers seleccionada: `Android_internal_testers`.
- Testers en la lista: 7.
- Enlaces para invitar testers:
  - Android: `https://play.google.com/store/apps/details?id=com.happycircles.app`
  - Web: `https://play.google.com/apps/testing/com.happycircles.app`
- Estado de publicacion: 13 cambios enviados a Google para revision. Play
  Console muestra "Tus cambios estan en proceso de revision".

Pendiente para pedir acceso a produccion:

- Agregar al menos 5 testers adicionales a la lista, o crear otra lista/grupo,
  hasta llegar a 12 testers que acepten participar.
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

Pendiente tecnico antes de subir el AAB:

- AAB generado con EAS: build `8d476add-8025-46f1-8d7a-7f9cd5d0f19a`,
  `versionName 0.1.2`, `versionCode 20`.
- AAB descargado localmente:
  `dist/mobile-builds/happy-circles-0.1.2-android-20.aab`.
- AAB subido manualmente a Play Console el 2026-08-11:
  `apps/mobile/happy-circles-1.0.1-21.aab`, `versionName 1.0.1`,
  `versionCode 21`.
- La version borrador anterior `13 (0.1.0)` fue removida de la version Alpha
  antes de enviar a revision.
- Usar credenciales de firma correctas de EAS/Play, no un build local firmado
  con debug keystore.
- Pendiente: configurar/asignar en EAS una Google Service Account Key con
  permisos de Play Store Submissions para poder subirlo por `eas submit`.
- `apps/mobile/eas.json` ya esta preparado para enviar Android a `alpha` como
  draft cuando la key de Google quede cargada en EAS.
- Busqueda local 2026-08-10: no se encontro el JSON de Google Service Account.
  La key de Google que aparece en EAS es de FCM/push, no sirve para subir a Play
  y su private key no se puede recuperar desde EAS.
- Avance 2026-08-10: creada la service account
  `happy-circles-play-submit@happy-circles-493003.iam.gserviceaccount.com` y
  agregada en Play Console como usuario activo para `Happy Circles`
  (`com.happycircles.app`) con permisos de testing.
- Bloqueo restante: Google Cloud genero dos descargas de key, pero el navegador
  integrado no las dejo disponibles en `Downloads` ni en la ruta segura
  esperada. Instalar el JSON real fuera del repositorio antes de ejecutar
  `eas credentials --platform android`.
