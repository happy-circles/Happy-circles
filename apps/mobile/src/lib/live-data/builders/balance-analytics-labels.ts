export function formatPeriodComparison(
  changeRatio: number | null,
  previousLabel: string | null,
): string {
  if (changeRatio === null || !previousLabel) {
    return 'No hay comparación disponible todavía.';
  }

  if (changeRatio === 0) {
    return `Sin cambio frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
  }

  const percentage = `${Math.round(Math.abs(changeRatio) * 100)}%`;
  return changeRatio > 0
    ? `Subio ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`
    : `Bajo ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
}
