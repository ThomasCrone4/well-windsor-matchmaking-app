import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'

export default function UserList() {
  // Get current user's profile
  const {
    data: currentProfile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ['my_profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('User not logged in')

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw new Error(error.message)
      return data
    },
  })

  // Only fetch all users *after* confirming admin role
  const {
    data: allUsers,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ['all_users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_profiles').select('*')
      if (error) throw new Error(error.message)
      return data
    },
    enabled: currentProfile?.role === 'admin', // prevent premature fetch
  })

  if (profileLoading || usersLoading) return <p className="text-center mt-20">Loading...</p>
  if (profileError) return <p className="text-center text-red-500">Error: {profileError.message}</p>

  // 👇 Redirect non-admins
  if (currentProfile?.role !== 'admin') {
    return <Navigate to="/" />
  }

  if (usersError) return <p className="text-center text-red-500">Error: {usersError.message}</p>

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">User Profiles</h1>
      <ul className="space-y-4">
        {allUsers.map((user) => (
          <li
            key={user.id}
            className="border p-4 rounded-lg shadow-sm bg-white flex justify-between items-center"
          >
            <div>
              <p className="text-lg font-semibold">ID: {user.id}</p>
              <p className="text-gray-600">Role: {user.role}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
