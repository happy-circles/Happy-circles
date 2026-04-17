# APP-HOUSE Blueprint

## Estado actual

- Archivo objetivo: [APP-HOUSE](https://www.figma.com/design/lx8ZekkFjbiFHIRgFTnFSe/APP-HOUSE?node-id=0-1)
- Cuenta conectada al plugin de Figma: `happy.circles.pds@gmail.com`
- Equipo disponible para trabajo: `El equipo de Happy Circles` con seat `Full`
- Lectura validada desde esta sesion: el nodo raiz `0:1` corresponde a una pagina vacia llamada `Page 1`
- Bloqueo actual: esta sesion no expone `use_figma`, asi que el blueprint queda listo en repo y el bootstrap del archivo se ejecuta en cuanto el escritor de canvas este disponible o se haga manualmente en Figma

## Contrato Figma <-> codigo

- `Figma` decide layout, jerarquia visual, copy visible, estados, prototipo y naming de pantallas.
- El repo decide validaciones, side effects, integraciones Supabase, permisos nativos, seguridad y transiciones tecnicas.
- Ninguna pantalla de Figma puede ser conceptual: cada frame debe mapear a una ruta o feature existente en `apps/mobile`.
- Un cambio de UX/UI nace en Figma y luego baja al codigo.
- Si el comportamiento tecnico cambia y afecta UX, la tarea no se cierra hasta actualizar Figma y las docs de flujo del repo.
- Los flujos de sistema viven en el repo, no dentro del archivo de producto.

## Bootstrap del archivo

Cuando haya escritura disponible en Figma, el archivo `APP-HOUSE` debe quedar con estas paginas, en este orden:

1. `01 Foundations`
2. `02 Components`
3. `03 User Flows`
4. `04 Screens`
5. `05 States`
6. `06 Prototype`

Convenciones obligatorias:

- Frames: `Flow / Screen / State`
- Componentes: `Component / Variant / State`
- Secciones dentro de pantallas: `Section / Nombre`
- Estados que impactan UX: `Default`, `Loading`, `Empty`, `Success`, `Error`, `Disabled`, `Permission`, `Blocked`

## Foundations

Fuente unica: [theme.ts](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/lib/theme.ts).

### Colores

| Grupo | Token | Valor |
| --- | --- | --- |
| Canvas | `background` | `#f7f8fb` |
| Canvas | `canvas` | `#eef1f6` |
| Surface | `surface` | `#ffffff` |
| Surface | `elevated` | `#ffffff` |
| Surface | `surfaceMuted` | `#f4f6fa` |
| Surface | `surfaceSoft` | `#e9edf5` |
| Border | `border` | `rgba(15, 23, 40, 0.08)` |
| Border | `hairline` | `rgba(15, 23, 40, 0.06)` |
| Text | `text` | `#0f1728` |
| Text | `textMuted` | `#667085` |
| Text | `muted` | `#98a2b3` |
| Brand | `primary` | `#141e33` |
| Brand | `primaryStrong` | `#0b1220` |
| Brand | `primarySoft` | `#e9edf5` |
| Brand | `primaryGhost` | `rgba(20, 30, 51, 0.08)` |
| Accent | `accent` | `#dfe5ef` |
| Accent | `accentSoft` | `#f2f4f8` |
| Semantic | `success` | `#0f8a5f` |
| Semantic | `successSoft` | `#dcf5eb` |
| Semantic | `warning` | `#a35f19` |
| Semantic | `warningSoft` | `#f9ead7` |
| Semantic | `danger` | `#b24338` |
| Semantic | `dangerSoft` | `#f9e2de` |
| Utility | `white` | `#ffffff` |
| Utility | `overlay` | `rgba(15, 23, 40, 0.24)` |
| Utility | `halo` | `rgba(20, 30, 51, 0.04)` |
| Utility | `haloStrong` | `rgba(15, 23, 40, 0.025)` |

### Tipografia

| Token | Tamano |
| --- | --- |
| `largeTitle` | `34` |
| `title1` | `28` |
| `title2` | `22` |
| `title3` | `19` |
| `body` | `16` |
| `callout` | `15` |
| `footnote` | `13` |
| `caption` | `12` |

### Radius

| Token | Valor |
| --- | --- |
| `pill` | `999` |
| `xlarge` | `32` |
| `large` | `24` |
| `medium` | `18` |
| `small` | `14` |
| `tiny` | `10` |

### Spacing

| Token | Valor |
| --- | --- |
| `xxs` | `4` |
| `xs` | `8` |
| `sm` | `12` |
| `md` | `16` |
| `lg` | `20` |
| `xl` | `28` |
| `xxl` | `40` |

### Sombras

- `card`: iOS `shadowOpacity 0.08`, `shadowRadius 22`, `shadowOffset 0/10`; Android `elevation 3`
- `floating`: iOS `shadowOpacity 0.14`, `shadowRadius 28`, `shadowOffset 0/18`; Android `elevation 7`

## Components

| Componente Figma | Fuente de codigo | Variantes y estados minimos |
| --- | --- | --- |
| `ScreenShell` | [screen-shell.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/screen-shell.tsx) | `HeaderVariant=card/plain`, `TitleAlign=left/center`, `TitleSize=largeTitle/title1/title2`, `Footer=on/off`, `Eyebrow=on/off`, `Subtitle=on/off` |
| `PrimaryAction` | [primary-action.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/primary-action.tsx) | `Variant=primary/secondary/ghost`, `Compact=true/false`, `Loading=true/false`, `Disabled=true/false`, `Subtitle=on/off` |
| `AppTextInput` | [app-text-input.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/app-text-input.tsx) | `Chrome=default/glass`, `State=default/focused/error/focused-error` |
| `SectionBlock` | [section-block.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/section-block.tsx) | `ActionSlot=on/off`, `Description=on/off` |
| `SurfaceCard` | [surface-card.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/surface-card.tsx) | `Variant=default/muted/accent/elevated`, `Padding=sm/md/lg` |
| `MessageBanner` | [message-banner.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/message-banner.tsx) | `Tone=primary/success/warning/danger/neutral` |
| `EmptyState` | [empty-state.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/empty-state.tsx) | `Action=on/off` |
| `StatusChip` | [status-chip.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/status-chip.tsx) | `Tone=primary/success/warning/danger/neutral` |
| `PersonRow` | [person-row.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/person-row.tsx) | `Direction=owes_me/i_owe/settled`, `Pending=on/off`, `Avatar=on/off` |
| `LoadingOverlay` | [loading-overlay.tsx](C:/Users/Samuel/Documents/Happy_circles/apps/mobile/src/components/loading-overlay.tsx) | `Visible=true/false`, `Message=on/off` |

## Inventario de pantallas

### `03 User Flows`

Cada flujo debe tener una ficha con:

- objetivo
- trigger
- pantallas involucradas
- happy path
- errores visibles
- siguiente paso

Flujos del primer lote:

- `Auth`
- `Onboarding`
- `Home`
- `Invite / Connect`
- `Profile`

### `04 Screens`

#### Auth

- `Auth / Sign In / Default`
- `Auth / Sign In / Register`
- `Auth / Sign In / Recover`
- `Auth / Reset Password / Default`
- `Auth / Reset Password / Invalid Link`

#### Onboarding

- `Onboarding / Setup Account / Profile`
- `Onboarding / Setup Account / Profile Error`
- `Onboarding / Setup Account / Photo`
- `Onboarding / Setup Account / Photo Permission`
- `Onboarding / Setup Account / Security`
- `Onboarding / Setup Account / Security Trusted`

#### Home

- `Home / Dashboard / Loading`
- `Home / Dashboard / Default`
- `Home / Dashboard / Empty`
- `Home / Dashboard / Error`

#### Invite

- `Invite / Start / Send`
- `Invite / Start / Receive`
- `Invite / Remote Invite / Ready`
- `Invite / Remote Invite / Share`
- `Invite / Remote Invite / Expired`
- `Invite / Link / Preparing Access`
- `Invite / Link / Claim`
- `Invite / Link / Review`
- `Invite / Link / Closed`

#### Profile

- `Profile / Main / Default`
- `Profile / Main / Security Focus`
- `Profile / Main / Trusted Device`
- `Profile / Main / Notification Disabled`
- `Profile / Complete / Legacy Redirect`

### `05 States`

Estados globales que deben existir como referencias reutilizables:

- `Default`
- `Loading`
- `Empty`
- `Success`
- `Error`
- `Disabled`
- `Permission`
- `Blocked`

## Prototype

El primer prototipo es `click-through`, sin microinteracciones complejas.

Recorridos minimos:

1. `/sign-in` -> `/setup-account?step=profile` -> `/setup-account?step=photo` -> `/setup-account?step=security` -> `/home`
2. `/home` -> `/invite` -> `share remote invite`
3. `/invite/[token]` -> `claim` o `review`
4. `/home` -> `/profile`
5. `/profile` -> `/setup-account?step=security`

Puertas de navegacion que deben verse en el prototipo:

- signed out -> `sign-in`
- signed in con setup incompleto -> `setup-account`
- pending invite intent despues de login/setup -> `invite/[token]`
- reset password valido -> `/home`

## Checklist de salida

- Las seis paginas existen y respetan el orden definido.
- Cada componente del inventario tiene correspondencia con su fuente en codigo.
- El primer lote cubre `Auth`, `Onboarding`, `Home`, `Invite` y `Profile`.
- El prototipo deja recorrer el happy path sin abrir el repo.
- Cada pantalla critica tiene al menos un estado de error o bloqueo visible.
- Los flujos de sistema estan reflejados en [system-flows.md](C:/Users/Samuel/Documents/Happy_circles/docs/figma/system-flows.md).
