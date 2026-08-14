import { describe, expect, it } from 'vitest';

import { resolveHydratedDraftValue } from './setup-draft';

describe('resolveHydratedDraftValue', () => {
  it('does not overwrite a local draft when a background profile refresh arrives', () => {
    expect(
      resolveHydratedDraftValue({
        current: 'Nombre que sigo escribiendo',
        incoming: 'Nombre anterior del servidor',
        isDirty: true,
        identityChanged: false,
      }),
    ).toBe('Nombre que sigo escribiendo');
  });

  it('resets drafts when the authenticated identity changes', () => {
    expect(
      resolveHydratedDraftValue({
        current: 'Borrador de otra cuenta',
        incoming: 'Perfil actual',
        isDirty: true,
        identityChanged: true,
      }),
    ).toBe('Perfil actual');
  });
});
