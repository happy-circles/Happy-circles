import { describe, expect, it, vi } from 'vitest';

import { prepareSetupProfileSave } from './setup-profile-save';

const draft = {
  fullName: 'Sara López',
  phoneCountryIso2: 'CO',
  phoneCountryCallingCode: '+57',
  phoneNationalNumber: '3001234567',
};

function makeInput() {
  return {
    draft,
    currentPhone: '+573001234567',
    profileComplete: true,
    preview: false,
    confirmIdentity: vi.fn().mockResolvedValue(true),
    onValidationError: vi.fn(),
  };
}

describe('profile save confirmation', () => {
  it('saves ordinary name edits without identity confirmation', async () => {
    const input = makeInput();
    expect(await prepareSetupProfileSave(input)).toEqual(draft);
    expect(input.confirmIdentity).not.toHaveBeenCalled();
  });

  it('compares normalized phone values before prompting', async () => {
    const input = { ...makeInput(), draft: { ...draft, phoneNationalNumber: '300 123 4567' } };
    await prepareSetupProfileSave(input);
    expect(input.confirmIdentity).not.toHaveBeenCalled();
  });

  it('confirms a changed phone inline before returning the pending draft', async () => {
    const input = { ...makeInput(), currentPhone: '+573009876543' };
    expect(await prepareSetupProfileSave(input)).toEqual(draft);
    expect(input.confirmIdentity).toHaveBeenCalledWith({
      actionLabel: 'cambiar tu celular',
      purpose: 'sensitive',
      force: true,
    });
  });

  it('returns no write on cancellation and preserves the draft', async () => {
    const input = { ...makeInput(), currentPhone: '+573009876543' };
    input.confirmIdentity.mockResolvedValue(false);
    expect(await prepareSetupProfileSave(input)).toBeNull();
    expect(input.draft).toEqual(draft);
    expect(input.onValidationError).not.toHaveBeenCalled();
  });

  it('validates fields before asking for confirmation', async () => {
    const input = { ...makeInput(), draft: { ...draft, fullName: '' } };
    expect(await prepareSetupProfileSave(input)).toBeNull();
    expect(input.onValidationError).toHaveBeenCalledOnce();
    expect(input.confirmIdentity).not.toHaveBeenCalled();
  });

  it.each([
    { profileComplete: false, preview: false },
    { profileComplete: true, preview: true },
  ])('allows initial setup and QA preview without authenticating a live account', async (state) => {
    const input = { ...makeInput(), currentPhone: '+573009876543', ...state };
    expect(await prepareSetupProfileSave(input)).toEqual(draft);
    expect(input.confirmIdentity).not.toHaveBeenCalled();
  });
});
