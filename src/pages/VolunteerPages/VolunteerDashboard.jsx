import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

export default function VolunteerDashboard() {
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user?.id) {
        toast.error('Unable to load user ID')
        return
      }
      setUserId(data.user.id)
    }

    fetchUser()
  }, [])

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['applications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, created_at, message, volunteer_opportunities (title, location, date_needed)')
        .eq('volunteer_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!userId,
  })

  const cancelMutation = useMutation({
    mutationFn: async (applicationId) => {
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', applicationId)

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Application cancelled and removed')
      refetch()
    },
    onError: () => toast.error('Failed to cancel application'),
  })

  const handleCancel = (id) => {
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this application?\n\nAn enquiry email has already been sent to the organisation.\n\nThis action cannot be undone and will remove this application from your dashboard.'
    )
    if (confirmCancel) cancelMutation.mutate(id)
  }

  if (isLoading) return <p className="text-center mt-10">Loading your dashboard...</p>
  if (error) return (
    <div className="text-center text-red-600 mt-10">
      <p>⚠️ Failed to load applications.</p>
      <p className="text-sm">{error.message}</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-center">My Applications</h1>

      {Array.isArray(data) && data.length > 0 ? (
        <ul className="space-y-4">
          {data.map((app, i) => (
            <li key={app.id || i} className="p-4 bg-white shadow rounded border">
              <h2 className="text-lg font-semibold">{app.volunteer_opportunities?.title}</h2>
              <div className="text-sm text-gray-600">
                📍 {app.volunteer_opportunities?.location}
              </div>
              {app.message && (
                <p className="text-sm text-gray-700 mt-1">
                  <span className="font-medium">Your message:</span> {app.message}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Applied on: {new Date(app.created_at).toLocaleString()}
              </p>

              <button
                onClick={() => handleCancel(app.id)}
                className="mt-3 text-sm text-red-600 hover:underline"
              >
                Cancel Application
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600 text-center">You haven’t applied to any roles yet.</p>
      )}
    </div>
  )
}
