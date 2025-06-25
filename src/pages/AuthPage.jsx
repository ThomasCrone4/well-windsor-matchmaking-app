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
  const [bio, setBio] = useState('');
  const [postcode, setPostcode] = useState('');
  const [dob, setDob] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [homeTown, setHomeTown] = useState('');
  const [dbsChecked, setDbsChecked] = useState(false);
  const [availableAnytime, setAvailableAnytime] = useState(true);
  const [availabilityMatrix, setAvailabilityMatrix] = useState([]);
  const [publicProfile, setPublicProfile] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  const validateFields = () => {
    const newErrors = {};
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    if (!name) newErrors.name = 'Name is required';
    if (role === 'volunteer') {
      if (!dob) newErrors.dob = 'Date of birth is required';
      if (!homeTown) newErrors.homeTown = 'Home town is required';
    }
    if (role === 'organization' && !postcode) newErrors.postcode = 'Postcode is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSigningUp && !validateFields()) {
      return;
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
        ...(role === 'organization' && { postcode }),
        ...(role === 'volunteer' && {
          dob,
          bio,
          contact_number: contactNumber,
          home_town: homeTown,
          dbs_checked: dbsChecked,
          available_anytime: availableAnytime,
          availability_matrix: availableAnytime ? null : availabilityMatrix,
          public_profile: publicProfile,
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

    toast.success('Success! You are now logged in.');
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded shadow w-full max-w-lg space-y-4"
      >
        <h2 className="text-2xl font-bold text-center">
          {isSigningUp ? 'Sign Up' : 'Log In'}
        </h2>

        <div>
          <label className="block text-sm font-medium mb-1">Email <span className="text-red-500">*</span></label>
          <input type="email" className="w-full p-2 border rounded" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password <span className="text-red-500">*</span></label>
          <input type="password" className="w-full p-2 border rounded" value={password} onChange={(e) => setPassword(e.target.value)} />
          {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
        </div>

        {isSigningUp && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Role <span className="text-red-500">*</span></label>
              <select className="w-full p-2 border rounded" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="volunteer">Volunteer</option>
                <option value="organization">Organization</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {role === 'organization' ? 'Organisation Name' : 'Full Name'} <span className="text-red-500">*</span>
              </label>
              <input type="text" className="w-full p-2 border rounded" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            {role === 'organization' && (
              <div>
                <label className="block text-sm font-medium mb-1">Postcode <span className="text-red-500">*</span></label>
                <input type="text" className="w-full p-2 border rounded" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
                {errors.postcode && <p className="text-red-500 text-sm mt-1">{errors.postcode}</p>}
              </div>
            )}

            {role === 'volunteer' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Home Town <span className="text-red-500">*</span></label>
                  <select className="w-full p-2 border rounded" value={homeTown} onChange={(e) => setHomeTown(e.target.value)}>
                    <option value="">Select your home town</option>
                    <option value="Windsor">Windsor</option>
                    <option value="Maidenhead">Maidenhead</option>
                    <option value="Slough">Slough</option>
                  </select>
                  {errors.homeTown && <p className="text-red-500 text-sm mt-1">{errors.homeTown}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Date of Birth <span className="text-red-500">*</span></label>
                  <input type="date" className="w-full p-2 border rounded" value={dob} onChange={(e) => setDob(e.target.value)} />
                  {errors.dob && <p className="text-red-500 text-sm mt-1">{errors.dob}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Contact Number <span className="text-gray-400">(optional)</span></label>
                  <input type="text" className="w-full p-2 border rounded" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
                </div>

                <label className="block text-sm font-medium">
                  <input type="checkbox" checked={dbsChecked} onChange={(e) => setDbsChecked(e.target.checked)} className="mr-2" />
                  DBS Checked
                </label>

                <label className="block text-sm font-medium">
                  <input type="checkbox" checked={availableAnytime} onChange={(e) => setAvailableAnytime(e.target.checked)} className="mr-2" />
                  Generally Available (all times)
                </label>

                {!availableAnytime && (
                  <AvailabilityMatrix value={availabilityMatrix} onChange={setAvailabilityMatrix} />
                )}

                <label className="block text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={publicProfile}
                    onChange={(e) => setPublicProfile(e.target.checked)}
                    className="mr-2"
                  />
                  Show my profile publicly on the volunteer page
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
            onClick={() => {
              setIsSigningUp(!isSigningUp);
              setErrors({});
            }}
            className="text-blue-600 underline"
          >
            {isSigningUp ? 'Log In' : 'Sign Up'}
          </button>
        </p>
      </form>
    </div>
  );
}
