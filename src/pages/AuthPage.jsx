// AuthPage.jsx
import { useState } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import AvailabilityMatrix from '../components/AvailabilityMatrix';
import { useNavigate } from 'react-router-dom';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('volunteer');

  // Shared
  const [name, setName] = useState('');

  // Volunteer fields
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState('');
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

    // Always
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    if (!name) newErrors.name = 'Name is required';

    if (isSigningUp) {
      if (role === 'volunteer') {
        if (!dob) newErrors.dob = 'Date of birth is required';
        if (!homeTown) newErrors.homeTown = 'Home town is required';
        // Bio & Skills only required if public
        if (publicProfile) {
          if (!bio?.trim()) newErrors.bio = 'Bio is required when profile is visible to organisations';
          if (!skills?.trim()) newErrors.skills = 'Skills are required when profile is visible to organisations';
        }
        if (!availableAnytime && (!availabilityMatrix || availabilityMatrix.length === 0)) {
          newErrors.availabilityMatrix = 'Please add at least one availability slot or mark "Flexible Availability".';
        }
      }

      if (role === 'organization') {
        if (!postcode) newErrors.postcode = 'Postcode is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSigningUp && !validateFields()) return;

    let authResponse;
    if (isSigningUp) {
      authResponse = await supabase.auth.signUp({ email, password });
    } else {
      authResponse = await supabase.auth.signInWithPassword({ email, password });
    }

    const { error: authError } = authResponse;
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
          bio: bio?.trim() || null,
          skills: skills?.trim() || null,
          contact_number: contactNumber || null,
          home_town: homeTown,
          dbs_checked: dbsChecked,
          available_anytime: availableAnytime,
          availability_matrix: availableAnytime ? null : availabilityMatrix,
          public_profile: publicProfile,
        }),
      };

      const { error: insertError } = await supabase.from('user_profiles').insert([profileData]);
      if (insertError) {
        toast.error(insertError.message);
        return;
      }
    }

    toast.success('Success! You are now logged in.');
    navigate('/');
  };

  const onTogglePublicProfile = (checked) => {
    setPublicProfile(checked);
    // Clear conditional errors if turning visibility off
    if (!checked) {
      setErrors((prev) => {
        const { bio, skills, ...rest } = prev;
        return rest;
      });
    }
  };

  // Forgot password handler
  const handleForgotPassword = async () => {
    if (!email) {
      toast('Enter your account email above first, then click "Forgot password?".');
      return;
    }
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Reset link sent! Check your inbox (and spam).');
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not send reset email. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-lg form">
        <h2 className="title">{isSigningUp ? 'Sign Up' : 'Log In'}</h2>

        {/* Email */}
        <div className="form-row">
          <label className="label">
            Email <span className="required" />
          </label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="error-text">{errors.email}</p>}
        </div>

        {/* Password */}
        <div className="form-row">
          <label className="label">
            Password <span className="required" />
          </label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
          />
          {errors.password && <p className="error-text">{errors.password}</p>}

          {/* NEW: Forgot password link */}
          {!isSigningUp && (
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm underline text-brand-teal"
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>

        {isSigningUp && (
          <>
            {/* Role */}
            <div className="form-row">
              <label className="label">
                Role <span className="required" />
              </label>
              <select
                className="select"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="volunteer">Volunteer</option>
                <option value="organization">Organisation</option>
              </select>
            </div>

            {/* Name */}
            <div className="form-row">
              <label className="label">
                {role === 'organization' ? 'Organisation Name' : 'Full Name'}{' '}
                <span className="required" />
              </label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="error-text">{errors.name}</p>}
            </div>

            {/* Org-only: Postcode */}
            {role === 'organization' && (
              <div className="form-row">
                <label className="label">
                  Postcode <span className="required" />
                </label>
                <input
                  type="text"
                  className="input"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  aria-invalid={!!errors.postcode}
                />
                {errors.postcode && <p className="error-text">{errors.postcode}</p>}
              </div>
            )}

            {/* Volunteer-only fields */}
            {role === 'volunteer' && (
              <>
                {/* Home Town */}
                <div className="form-row">
                  <label className="label">
                    Home Town <span className="required" />
                  </label>
                  <select
                    className={`select ${errors.homeTown ? 'select-invalid' : ''}`}
                    value={homeTown}
                    onChange={(e) => setHomeTown(e.target.value)}
                    aria-invalid={!!errors.homeTown}
                  >
                    <option value="">Select your home town</option>
                    <option value="Windsor">Windsor</option>
                    <option value="Maidenhead">Maidenhead</option>
                    <option value="Slough">Slough</option>
                  </select>
                  {errors.homeTown && <p className="error-text">{errors.homeTown}</p>}
                </div>

                {/* Date of Birth */}
                <div className="form-row">
                  <label className="label">
                    Date of Birth <span className="required" />
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    aria-invalid={!!errors.dob}
                  />
                  {errors.dob && <p className="error-text">{errors.dob}</p>}
                </div>

                {/* Contact Number */}
                <div className="form-row">
                  <label className="label">
                    Contact Number <span className="help-text">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                  />
                </div>

                {/* Bio */}
                <div className="form-row">
                  <label className="label">
                    Bio{' '}
                    {publicProfile ? <span className="required" /> : <span className="help-text">(optional)</span>}
                  </label>
                  <textarea
                    className={`textarea ${errors.bio ? 'input-invalid' : ''}`}
                    placeholder="Tell us about yourself..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    aria-invalid={!!errors.bio}
                  />
                  {errors.bio && <p className="error-text">{errors.bio}</p>}
                </div>

                {/* Skills */}
                <div className="form-row">
                  <label className="label">
                    Skills / Experience{' '}
                    {publicProfile ? <span className="required" /> : <span className="help-text">(optional)</span>}
                  </label>
                  <textarea
                    className={`textarea ${errors.skills ? 'input-invalid' : ''}`}
                    placeholder="e.g. Working with children, first aid, cooking"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    aria-invalid={!!errors.skills}
                  />
                  {errors.skills && <p className="error-text">{errors.skills}</p>}
                </div>

                {/* Visibility & Availability */}
                <div className="check-row">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={dbsChecked}
                      onChange={(e) => setDbsChecked(e.target.checked)}
                      className="check"
                    />
                    DBS Checked
                  </label>

                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={availableAnytime}
                      onChange={(e) => setAvailableAnytime(e.target.checked)}
                      className="check"
                    />
                    Flexible Availability
                  </label>

                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={publicProfile}
                      onChange={(e) => onTogglePublicProfile(e.target.checked)}
                      className="check"
                    />
                    Allow organisations to view my profile and contact me
                  </label>
                </div>

                {!availableAnytime && (
                  <>
                    <AvailabilityMatrix
                      value={availabilityMatrix}
                      onChange={setAvailabilityMatrix}
                    />
                    {errors.availabilityMatrix && (
                      <p className="error-text">{errors.availabilityMatrix}</p>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Submit */}
        <button type="submit" className="btn btn-primary btn-block">
          {isSigningUp ? 'Create Account' : 'Log In'}
        </button>

        {/* Switch mode */}
        <p className="text-center">
          <span className="text-sm">
            {isSigningUp ? 'Already have an account?' : 'Need to create an account?'}{' '}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSigningUp(!isSigningUp);
              setErrors({});
            }}
            className="underline text-brand-teal"
          >
            {isSigningUp ? 'Log In' : 'Sign Up'}
          </button>
        </p>
      </form>
    </div>
  );
}
