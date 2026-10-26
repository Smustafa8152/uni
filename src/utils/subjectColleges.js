export function chosenCollegeIds(formData, authCollegeId) {
  if (formData.major_scope === 'university_wide') return []
  const picked = [...new Set(
    (formData.selected_college_ids || [])
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id))
  )]
  if (picked.length) return picked
  const fallback = parseInt(authCollegeId, 10)
  return Number.isFinite(fallback) ? [fallback] : []
}

export async function saveSubjectColleges(supabase, subjectId, collegeIds) {
  const { error: deleteError } = await supabase.from('subject_colleges').delete().eq('subject_id', subjectId)
  if (deleteError) throw deleteError
  if (!collegeIds.length) return
  const { error } = await supabase.from('subject_colleges').insert(
    collegeIds.map((collegeId) => ({ subject_id: subjectId, college_id: collegeId }))
  )
  if (error) throw error
}

export function collegeScopeFilter(collegeIds) {
  return [...collegeIds.map((id) => `college_id.eq.${id}`), 'is_university_wide.eq.true'].join(',')
}
