# Mobile Typography

Happy Circles mobile respects the device font-size setting, but every visible text role has a
maximum multiplier so the interface stays stable at large accessibility sizes.

Use `AppText` for visible copy and `AppTextInput` for editable fields. Do not import `Text` or
`TextInput` directly from `react-native` outside the approved wrapper files.

## Roles

- `display`: large amounts, logos, hero numbers. Use when layout stability matters most.
- `title`: screen headings, section titles, prominent labels.
- `body`: regular readable copy.
- `caption`: helper text, metadata, secondary descriptions.
- `control`: buttons, chips, tabs, badges, compact interactive labels.
- `input`: editable fields.
- `fixed`: invisible text or very compact technical labels such as chart ticks.

## Variants

Prefer semantic variants when adding new text:

- `amountHero` or `amountLarge` for money totals.
- `largeTitle`, `title1`, `title2`, `title3` for headings.
- `body` or `callout` for regular copy.
- `footnote` or `caption` for supporting copy.
- `control`, `badge`, or `micro` for compact controls.
- `otpDigit` for confirmation-code boxes.
- `chartLabel` only when a chart label must remain tightly bounded.

Legacy styles may still provide local `fontSize` and `lineHeight`; `AppText` infers a safe scaling
role from the local size. New code should prefer a variant so the role is explicit.
