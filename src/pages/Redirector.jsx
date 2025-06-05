import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'

export default function Redirector() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAndRedirect = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const userId = session?.user?.id
      if (!userId) {
        navigate('/auth')
        return
      }

      console.log('🔎 userId:', userId)

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .limit(1)
        .maybeSingle()

      console.log('📄 profile result:', profile)
      console.log('❌ error (if any):', error)

      if (error || !profile) {
        navigate('/auth')
        return
      }

      if (profile.role === 'volunteer') {
        navigate('/volunteer-dashboard')
      } else if (profile.role === 'organization') {
        navigate('/organization-dashboard')
      } else {
        navigate('/auth')
      }
    }

    checkAndRedirect().finally(() => setLoading(false))
  }, [navigate])

  return (
    <div className="flex items-center justify-center h-screen text-xl text-gray-600">
      {loading ? 'Loading your dashboard...' : 'Redirecting...'}
    </div>
  )
}
