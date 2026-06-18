import { supabase } from '../lib/supabase'

export async function sendInstructorAnnouncement(payload) {
  const { data, error } = await supabase.functions.invoke('send-instructor-communication', {
    body: { type: 'announcement', ...payload },
  })

  if (error) throw new Error(error.message || 'Failed to send announcement')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function sendInstructorPrivateMessage(payload) {
  const { data, error } = await supabase.functions.invoke('send-instructor-communication', {
    body: { type: 'message', ...payload },
  })

  if (error) throw new Error(error.message || 'Failed to send message')
  if (data?.error) throw new Error(data.error)
  return data
}
