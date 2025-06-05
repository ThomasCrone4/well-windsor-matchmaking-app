import { useQuery } from '@tanstack/react-query'
import { supabase } from '../utils/supabase'
import { toast } from 'react-hot-toast'
import { useState } from 'react'

export default function OpportunitiesPage() {
  const [revealedContacts, setRevealedContacts] = useState({})

  const { data, error, isLoading } = useQuery({
    queryKey: ['volunteer_opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_opportunities')
        .select('id, title, description, location, date_needed, contact')
        .order('date_needed', { ascending: true })

      if (error) throw new Error(error.message)
      return data
    },
  })

  const handleApply = async (opportunityId) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData?.session?.user

    if (!user) {
      toast.error('Please log in to apply.')
      window.location.href = '/auth'
      return
    }

    setRevealedContacts(prev => ({ ...prev, [opportunityId]: true }))
    toast.success('Contact information revealed.')
  }

  if (isLoading) return <p className="text-center mt-20">Loading opportunities...</p>
  if (error) {
    toast.error(`Error loading opportunities: ${error.message}`)
    return <p className="text-center mt-20 text-red-500">Failed to load opportunities.</p>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">Volunteer Opportunities</h1>

      {data.length === 0 ? (
        <p className="text-center text-gray-600">No opportunities available right now.</p>
      ) : (
        <ul className="space-y-6">
          {data.map((opportunity) => (
            <li
              key={opportunity.id}
              className="p-6 border rounded-lg shadow-sm bg-white space-y-2"
            >
              <h2 className="text-xl font-semibold">{opportunity.title}</h2>
              {opportunity.description && (
                <p className="text-gray-700">{opportunity.description}</p>
              )}
              <div className="text-sm text-gray-600">
                📍 Location: {opportunity.location}
              </div>
              <div className="text-sm text-gray-600">
                📅 Date Needed: {new Date(opportunity.date_needed).toLocaleDateString()}
              </div>

              <button
                onClick={() => handleApply(opportunity.id)}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Apply
              </button>

              {revealedContacts[opportunity.id] && opportunity.contact && (
                <p className="text-sm text-green-600 mt-2">
                  📞 Contact: {opportunity.contact}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
