// AuthPage.jsx
import { useState } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'react-hot-toast';
import AvailabilityMatrix from '../components/AvailabilityMatrix';
import { useNavigate } from 'react-router-dom';
import { TOWNS } from '../utils/towns';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('volunteer');

  // Shared
  const [name, setName] = useState('');

  // Volunteer fields
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState('');
  const [dob, setDob] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [homeTown, setHomeTown] = useState('');
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
      if (password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      }

      // Both roles need a town: volunteers to be matched locally,
      // organisations so their listings can be filtered by area.
      if (!homeTown) newErrors.homeTown = 'Town is required';

      if (role === 'volunteer') {
        if (!dob) {
          newErrors.dob = 'Date of birth is required';
        } else {
          // Mirrors the user_profiles_min_age constraint, so the user gets
          // a readable message instead of a Postgres error.
          const thirteenthBirthday = new Date(dob);
          thirteenthBirthday.setFullYear(thirteenthBirthday.getFullYear() + 13);
          if (thirteenthBirthday > new Date()) {
            newErrors.dob = 'You must be at least 13 years old to sign up';
          }
        }

        // Bio & Skills only required if public
        if (publicProfile) {
          if (!bio?.trim()) newErrors.bio = 'Bio is required when profile is visible to organisations';
          if (!skills?.trim()) newErrors.skills = 'Skills are required when profile is visible to organisations';
        }
        if (!availableAnytime && (!availabilityMatrix || availabilityMatrix.length === 0)) {
          newErrors.availabilityMatrix = 'Please add at least one availability slot or mark "Flexible Availability".';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSigningUp && !validateFields()) return;

    if (!isSigningUp) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Welcome back!');
      navigate('/');
      return;
    }

    // Profile fields travel as auth metadata; the on_auth_user_created
    // trigger writes the user_profiles row. Previously this was signUp()
    // followed by a separate insert, which had two failure modes: it sent
    // a `postcode` column that does not exist (so no organisation could
    // ever complete signup), and it assumed signUp returns a session,
    // which is false when email confirmation is on -- leaving an auth
    // account with no profile and no way to recover.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          name: name.trim(),
          home_town: homeTown,
          ...(role === 'volunteer' && {
            dob,
            contact_number: contactNumber?.trim() || null,
            bio: bio?.trim() || null,
            skills: skills?.trim() || null,
            available_anytime: availableAnytime,
            availability_matrix: availableAnytime ? null : availabilityMatrix,
            public_profile: publicProfile,
          }),
        },
      },
    });

    if (signUpError) {
      toast.error(signUpError.message);
      return;
    }

    // No session means Supabase is waiting on email confirmation. The
    // profile already exists either way, so the account is not stranded.
    if (!data?.session) {
      toast.success('Account created. Check your email to confirm, then log in.');
      setIsSigningUp(false);
      return;
    }

    toast.success('Success! You are now logged in.');
    navigate('/');
  };

  const onTogglePublicProfile = (checked) => {
    setPublicProfile(checked);
    // Clear conditional errors if turning visibility off
    if (!checked) {
      setErrors((prev) => {
        // Deliberately dropping the bio/skills errors; underscore prefix
        // marks them as intentionally unused for eslint.
        const { bio: _bio, skills: _skills, ...rest } = prev;
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
      const appBase = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
      const redirectTo = `${appBase.replace(/\/$/, '')}/reset-password`;
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
    /* Two columns from lg: the charity's photograph carrying the same
       slogan as the home page on the left, the form on the right. A single
       card centred in an otherwise empty white page was the least finished
       screen in the app, and it is the one every volunteer passes through.
       The panel is hidden below lg so a phone gets straight to the form. */
    <div
      className="grid min-h-[calc(100vh-93px)] lg:grid-cols-2"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <aside className="relative hidden overflow-hidden lg:block" style={{ backgroundColor: '#06222a' }}>
        <picture>
          <source
            type="image/webp"
            sizes="50vw"
            srcSet="/images/wellwindsorshootstill037-800.webp 800w,
                    /images/wellwindsorshootstill037-1280.webp 1280w"
          />
          <img
            src="/images/wellwindsorshootstill037-1280.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: 'center 30%' }}
          />
        </picture>
        {/* Bottom-weighted here, not left: the copy sits along the bottom
            edge of a tall narrow panel rather than in a left-hand column. */}
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(to top, rgba(6,34,42,.94) 14%, rgba(6,34,42,.6) 58%, rgba(6,34,42,.2) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="max-w-[18ch] text-3xl font-semibold leading-[1.12] tracking-[-0.03em] text-white">
            Adults show up. Children take part.{' '}
            {/* Cyan on the scrim only. On any light surface this is 1.66:1. */}
            <span className="font-bold" style={{ color: 'var(--color-brand)' }}>
              Everyone plays a role.
            </span>
          </p>
          <p className="mt-4 max-w-[38ch] text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Volunteering with schools and organisations across Windsor.
          </p>
        </div>
      </aside>

      <div className="flex items-center justify-center px-4 py-12">
        <form onSubmit={handleSubmit} className="card w-full max-w-lg form">
        <h2 className="title text-center !text-2xl">{isSigningUp ? 'Create your account' : 'Sign in'}</h2>

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
                className="text-sm underline text-brand-ink"
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

            {/* Town — both roles. Organisations previously had a free-text
                postcode field that was written to a column which does not
                exist, so organisation signup always failed. */}
            <div className="form-row">
              <label className="label">
                {role === 'organization' ? 'Town' : 'Home Town'}{' '}
                <span className="required" />
              </label>
              <select
                className={`select ${errors.homeTown ? 'select-invalid' : ''}`}
                value={homeTown}
                onChange={(e) => setHomeTown(e.target.value)}
                aria-invalid={!!errors.homeTown}
              >
                <option value="">
                  {role === 'organization' ? 'Select your town' : 'Select your home town'}
                </option>
                {TOWNS.map((town) => (
                  <option key={town} value={town}>{town}</option>
                ))}
              </select>
              {errors.homeTown && <p className="error-text">{errors.homeTown}</p>}
            </div>

            {/* Volunteer-only fields */}
            {role === 'volunteer' && (
              <>
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
          {isSigningUp ? 'Create account' : 'Sign in'}
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
            className="underline text-brand-ink"
          >
            {isSigningUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
        </form>
      </div>
    </div>
  );
}
