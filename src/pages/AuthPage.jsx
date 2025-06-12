import { useState } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import AvailabilityMatrix from '../components/AvailabilityMatrix';
import { useNavigate } from 'react-router-dom';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('volunteer');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [dob, setDob] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [homeTown, setHomeTown] = useState('');
  const [dbsChecked, setDbsChecked] = useState(false);
  const [availableAnytime, setAvailableAnytime] = useState(true);
  const [availabilityMatrix, setAvailabilityMatrix] = useState([]);
  const [homeTownOnly, setHomeTownOnly] = useState(false);
  const [autoEnquiryOptIn, setAutoEnquiryOptIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSigningUp) {
      if (!name || !location || (role === 'volunteer' && (!dob || !homeTown))) {
        toast.error('Please fill in all required fields.');
        return;
      }
    }

    let authResponse;
    if (isSigningUp) {
      authResponse = await supabase.auth.signUp({ email, password });
    } else {
      authResponse = await supabase.auth.signInWithPassword({ email, password });
    }

    const { data, error: authError } = authResponse;
    if (authError) {
      toast.error(authError.message);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      toast.error('Could not verify user login.');
      return;
    }

    const sessionUserId = userData.user.id;

    if (isSigningUp) {
      const profileData = {
        id: sessionUserId,
        role,
        name,
        location,
        ...(role === 'volunteer' && {
          dob,
          contact_number: contactNumber,
          home_town: homeTown,
          dbs_checked: dbsChecked,
          available_anytime: availableAnytime,
          availability_matrix: availableAnytime ? null : availabilityMatrix,
          home_town_only: homeTownOnly,
          auto_enquiry_opt_in: autoEnquiryOptIn,
        }),
      };

      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert([profileData]);

      if (insertError) {
        toast.error(insertError.message);
        return;
      }
    }

    console.log('✅ Inserted user profile successfully');
    toast.success('Success! You are now logged in.');
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow w-full max-w-lg space-y-4">
        <h2 className="text-2xl font-bold text-center">
          {isSigningUp ? 'Sign Up' : 'Log In'}
        </h2>

        <input
          type="email"
          className="w-full p-2 border rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          className="w-full p-2 border rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {isSigningUp && (
          <>
            <select
              className="w-full p-2 border rounded"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="volunteer">Volunteer</option>
              <option value="organization">Organization</option>
            </select>

            {role === 'volunteer' && (
              <input
              type="text"
              className="w-full p-2 border rounded"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            )} 

            {role === 'organization' && (
              <>
                <input
                  type="text"
                  className="w-full p-2 border rounded"
                  placeholder="Organization Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <select
                  className="w-full p-2 border rounded"
                  value={homeTown}
                  onChange={(e) => setHomeTown(e.target.value)}
                >
                  <option value="">Select your organizations town</option>
                  <option value="Windsor">Windsor</option>
                  <option value="Maidenhead">Maidenhead</option>
                  <option value="Slough">Slough</option>
                </select>
              </>
            )} 
            

            

            {role === 'volunteer' && (
              <>
                <select
                  className="w-full p-2 border rounded"
                  value={homeTown}
                  onChange={(e) => setHomeTown(e.target.value)}
                >
                  <option value="">Select your home town</option>
                  <option value="Windsor">Windsor</option>
                  <option value="Maidenhead">Maidenhead</option>
                  <option value="Slough">Slough</option>
                </select>
                
                <input
                  type="date"
                  className="w-full p-2 border rounded"
                  placeholder="Date of Birth"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />

                <input
                  type="text"
                  className="w-full p-2 border rounded"
                  placeholder="Contact Number"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />

                

                <label className="block">
                  <input
                    type="checkbox"
                    checked={dbsChecked}
                    onChange={(e) => setDbsChecked(e.target.checked)}
                  />
                  {' '}DBS Checked
                </label>

                <label className="block">
                  <input
                    type="checkbox"
                    checked={availableAnytime}
                    onChange={(e) => setAvailableAnytime(e.target.checked)}
                  />
                  {' '}Generally Available (all times)
                </label>

                {!availableAnytime && (
                  <AvailabilityMatrix
                    value={availabilityMatrix}
                    onChange={setAvailabilityMatrix}
                  />
                )}

                <label className="block">
                  <input
                    type="checkbox"
                    checked={homeTownOnly}
                    onChange={(e) => setHomeTownOnly(e.target.checked)}
                  />
                  {' '}Only match me to opportunities in my home town
                </label>

                <label className="block">
                  <input
                    type="checkbox"
                    checked={autoEnquiryOptIn}
                    onChange={(e) => setAutoEnquiryOptIn(e.target.checked)}
                  />
                  {' '}Auto-enquiry opt-in
                </label>
              </>
            )}
          </>
        )}

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          {isSigningUp ? 'Create Account' : 'Log In'}
        </button>

        <p className="text-sm text-center">
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
  );
}
