/**
 * useSmartMatching Hook
 * ML-powered volunteer-opportunity matching
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../utils/supabase';

export const useSmartMatching = (volunteerId) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Calculate skill similarity based on overlap
   * @param {string|Array} volunteerSkills - Skills of volunteer (might be JSON string)
   * @param {string|Array} opportunitySkills - Required skills for opportunity (might be JSON string)
   * @returns {number} - Similarity score 0-1
   */
  const calculateSkillsSimilarity = useCallback((volunteerSkills, opportunitySkills) => {
    // Parse skills if they're JSON strings
    let volSkillsArray = volunteerSkills;
    let oppSkillsArray = opportunitySkills;

    if (typeof volunteerSkills === 'string') {
      try {
        volSkillsArray = JSON.parse(volunteerSkills);
      } catch (e) {
        volSkillsArray = [];
      }
    }

    if (typeof opportunitySkills === 'string') {
      try {
        oppSkillsArray = JSON.parse(opportunitySkills);
      } catch (e) {
        oppSkillsArray = [];
      }
    }

    if (!volSkillsArray?.length || !oppSkillsArray?.length) {
      return 0;
    }

    const volunteerSet = new Set(volSkillsArray.map(s => String(s).toLowerCase()));
    const opportunitySet = new Set(oppSkillsArray.map(s => String(s).toLowerCase()));

    const intersection = Array.from(volunteerSet).filter(skill =>
      opportunitySet.has(skill)
    );

    const union = new Set([...volunteerSet, ...opportunitySet]);
    return intersection.length / union.size; // Jaccard similarity
  }, []);

  /**
   * Calculate availability match
   * @param {Object} volunteer - Volunteer profile
   * @param {Object} opportunity - Opportunity data
   * @returns {number} - Availability score 0-1
   */
  const calculateAvailabilityMatch = useCallback((volunteer, opportunity) => {
    // Simplified version: assume all volunteers are available
    // In production, you'd check availability_matrix against opportunity schedule
    return 0.8; // Default to 80% availability match
  }, []);

  /**
   * Fetch and calculate matches for a volunteer
   */
  const fetchSmartMatches = useCallback(async (volId = volunteerId) => {
    if (!volId) {
      setError('Volunteer ID required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Fetching matches for volunteer:', volId);
      
      // If no volunteer ID provided, return empty matches
      if (!volId) {
        setMatches([]);
        return;
      }

      // Fetch volunteer with embedding (just by ID, don't filter by role)
      const { data: volunteer, error: volError } = await supabase
        .from('user_profiles')
        .select('id, name, bio, skills, embedding_vector, role')
        .eq('id', volId)
        .single();

      if (volError) {
        console.warn('Volunteer fetch warning:', volError.message);
        setMatches([]);
        return;
      }

      if (!volunteer) {
        console.log('No volunteer found');
        setMatches([]);
        return;
      }

      // Only proceed if user is actually a volunteer
      if (volunteer.role !== 'volunteer') {
        console.log('User is not a volunteer, skipping ML matching');
        setMatches([]);
        return;
      }

      // Fetch pre-calculated match results from database
      const { data: matchResults, error: matchError } = await supabase
        .from('match_results')
        .select('*, volunteer_opportunities(id, title)')
        .eq('volunteer_id', volId)
        .order('match_score', { ascending: false });

      if (matchError) {
        console.warn('Match results fetch error:', matchError?.message);
        setMatches([]);
        return;
      }

      console.log('📊 Raw match results from DB:', matchResults);

      if (!matchResults || matchResults.length === 0) {
        console.log('No pre-calculated matches found for volunteer');
        setMatches([]);
        return;
      }

      // Transform match results to expected format
      const matchedOpportunities = matchResults
        .map(match => {
          const transformed = {
            opportunity_id: match.opportunity_id,
            opportunityTitle: match.volunteer_opportunities?.title || 'Unknown',
            composite_score: Math.round((match.match_score || 0) * 100), // Convert 0-1 to 0-100
            semantic_similarity: match.bio_similarity || 0,
            skills_match_percentage: Math.round((match.skills_similarity || 0) * 100),
            availability_match: Math.round((match.availability_match || 0) * 100),
            explanation: {
              semantic: match.bio_similarity || 0,
              skills: match.skills_similarity || 0,
              availability: match.availability_match || 0,
            },
          };
          console.log('Transformed match:', transformed);
          return transformed;
        })
        .filter(Boolean)
        .sort((a, b) => b.composite_score - a.composite_score);

      console.log('✅ Final matches to display:', matchedOpportunities);
      setMatches(matchedOpportunities);
    } catch (err) {
      console.error('Error fetching smart matches:', err.message);
      setError(err.message);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [volunteerId, calculateSkillsSimilarity, calculateAvailabilityMatch]);

  /**
   * Generate human-readable explanation for match
   */
  const generateMatchExplanation = (scoreData) => {
    const reasons = [];

    if (scoreData.semantic > 0.75) {
      reasons.push('Great skill match based on your profile');
    } else if (scoreData.semantic > 0.5) {
      reasons.push('Good profile alignment');
    }

    if (scoreData.skills > 0.5) {
      reasons.push(`You have ${Math.round(scoreData.skills * 100)}% of required skills`);
    }

    if (scoreData.availability === 1) {
      reasons.push('Perfect availability match');
    }

    if (scoreData.urgent && scoreData.availability > 0.5) {
      reasons.push('You can help with urgent need');
    }

    return reasons.length > 0
      ? reasons.join(' • ')
      : 'This opportunity could be a good fit';
  };

  // Auto-fetch matches when volunteerId changes
  useEffect(() => {
    if (volunteerId) {
      fetchSmartMatches(volunteerId);
    }
  }, [volunteerId]);

  return {
    matches,
    loading,
    error,
    fetchSmartMatches,
  };
};

/**
 * useMatchDetails Hook
 * Get detailed match information for a specific pairing
 */
export const useMatchDetails = (volunteerId, opportunityId) => {
  const [matchDetails, setMatchDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMatchDetails = useCallback(async () => {
    if (!volunteerId || !opportunityId) {
      setError('Volunteer ID and Opportunity ID required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch previous match record if exists
      const { data: matchRecord, error: matchError } = await supabase
        .from('match_results')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .eq('opportunity_id', opportunityId)
        .maybeSingle();

      if (!matchError && matchRecord) {
        setMatchDetails(matchRecord);
      } else {
        setMatchDetails(null);
      }
    } catch (err) {
      console.error('Error fetching match details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [volunteerId, opportunityId]);

  return {
    matchDetails,
    loading,
    error,
    fetchMatchDetails,
  };
};
