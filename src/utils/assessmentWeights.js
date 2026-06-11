/**
 * Sum assessment weight_percentage values for a class, replacing the row being edited with draft weight.
 */
export function computeAssessmentWeightTotal(
  assessments,
  { editingId = null, draftWeight = 0 } = {},
) {
  const draft = Math.max(0, Number(draftWeight) || 0)
  let total = 0

  for (const item of assessments || []) {
    if (editingId != null && item.id === editingId) {
      total += draft
    } else {
      total += Math.max(0, Number(item.weight_percentage) || 0)
    }
  }

  if (editingId == null) {
    total += draft
  }

  const rounded = Math.round(total * 100) / 100
  return {
    total: rounded,
    exceeds: rounded > 100.0001,
    remaining: Math.max(0, Math.round((100 - rounded) * 100) / 100),
  }
}
