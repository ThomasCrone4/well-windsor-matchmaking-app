import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { toast } from 'react-hot-toast'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('volunteer')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [dob, setDob] = useState('')
  const [isSigningUp, setIsSigningUp] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    // ✅ Only validate extra fields if signing up
    if (isSigningUp) {
      if (!name || !location || (role === 'volunteer' && !dob)) {
        toast.error('Please fill in all required fields.')
        return
      }
    }

    let authResponse
    if (isSigningUp) {
      authResponse = await supabase.auth.signUp({ email, password })
    } else {
      authResponse = await supabase.auth.signInWithPassword({ email, password })
    }

    const { data, error: authError } = authResponse
    if (authError) {
      toast.error(authError.message)
      return
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user?.id) {
      toast.error('Could not verify user login.')
      return
    }

    const sessionUserId = userData.user.id

    if (isSigningUp) {
      const profileData = {
        id: sessionUserId,
        role,
        name,
        location,
        ...(role === 'volunteer' && { dob }),
      }

      const { error: insertError } = await supabase.from('user_profiles').insert([profileData])
      if (insertError) {
        toast.error(insertError.message)
        return
      }
    }
    console.log('✅ Inserted user profile successfully')
    toast.success('Success! You are now logged in.')
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
          <>
            <select
              className="w-full p-2 mb-3 border rounded"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="volunteer">Volunteer</option>
              <option value="organization">Organization</option>
            </select>

            <input
              type="text"
              className="w-full p-2 mb-3 border rounded"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              type="text"
              className="w-full p-2 mb-3 border rounded"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            {role === 'volunteer' && (
              <input
                type="date"
                className="w-full p-2 mb-3 border rounded"
                placeholder="Date of Birth"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            )}
          </>
        )}

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
