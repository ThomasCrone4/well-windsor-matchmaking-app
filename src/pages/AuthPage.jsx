import { useState } from 'react'
import { supabase } from '../utils/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('volunteer')
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    let authResponse

    if (isSigningUp) {
      authResponse = await supabase.auth.signUp({ email, password })
    } else {
      authResponse = await supabase.auth.signInWithPassword({ email, password })
    }

    const { data, error: authError } = authResponse

    if (authError) {
      setError(authError.message)
      return
    }

    // ✅ Get user ID directly (more reliable than session wait)
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData?.user?.id) {
      console.error('❌ Failed to get user:', userError?.message)
      setError('Could not verify user login.')
      return
    }

    const sessionUserId = userData.user.id
    console.log('✅ Got user ID from auth:', sessionUserId)

    if (isSigningUp) {
      console.log('📝 Inserting into user_profiles with:', {
        id: sessionUserId,
        role,
      })

      const { error: insertError } = await supabase.from('user_profiles').insert([
        {
          id: sessionUserId,
          role,
        },
      ])

      if (insertError) {
        console.error('❌ Insert failed:', insertError.message)
        setError(insertError.message)
        return
      }

      console.log('✅ Profile inserted for:', sessionUserId)
    }

    alert('✅ Success! Check Supabase for the user profile.')
    window.location.href = '/'

  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-4 text-center">
          {isSigningUp ? 'Sign Up' : 'Log In'}
        </h2>

        <input
          type="email"
          className="w-full p-2 mb-3 border rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          className="w-full p-2 mb-3 border rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {isSigningUp && (
          <select
            className="w-full p-2 mb-4 border rounded"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="volunteer">Volunteer</option>
            <option value="organization">Organization</option>
          </select>
        )}

        {error && <p className="text-red-500 mb-3">{error}</p>}

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          {isSigningUp ? 'Create Account' : 'Log In'}
        </button>

        <p className="mt-4 text-sm text-center">
          {isSigningUp ? 'Already have an account?' : 'Need to create an account?'}{' '}
          <button
            type="button"
            onClick={() => setIsSigningUp(!isSigningUp)}
            className="text-blue-600 underline"
          >
            {isSigningUp ? 'Log In' : 'Sign Up'}
          </button>
        </p>
      </form>
    </div>
  )
}
