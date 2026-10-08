export function inviteActionResult(status: string, kind: 'friendship' | 'account' = 'friendship') {
  const subject = kind === 'account' ? 'El acceso' : 'La invitación';
  return {
    connected: status === 'accepted',
    message:
      status === 'accepted'
        ? kind === 'account'
          ? 'Acceso confirmado.'
          : 'La amistad ya está activa.'
        : status === 'rejected'
          ? kind === 'account'
            ? 'El acceso fue rechazado.'
            : 'La invitación fue rechazada.'
          : status === 'canceled'
            ? kind === 'account'
              ? 'El acceso ya fue cancelado.'
              : 'La invitación ya fue cancelada.'
            : status === 'expired'
              ? `${subject} ya venció. Puedes enviar una nueva invitación.`
              : 'El estado de la invitación cambió. Actualizamos la lista.',
  };
}
