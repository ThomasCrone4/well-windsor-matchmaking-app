/**
 * Embedding Service
 * Manages embedding generation and storage in Supabase
 */

import { supabase } from './supabase';
import {
  generateEmbedding,
  generateBatchEmbeddings,
  createVolunteerEmbeddingText,
  createOpportunityEmbeddingText,
  truncateForEmbedding,
} from './openaiService';

/**
 * Generate and store embedding for a volunteer profile
 * @param {string} volunteerId - Volunteer UUID
 * @param {Object} volunteer - Volunteer data
 * @returns {Promise<Object>} - Updated volunteer with embedding_vector
 */
export async function generateVolunteerEmbedding(volunteerId, volunteer) {
  try {
    const embeddingText = truncateForEmbedding(
      createVolunteerEmbeddingText(volunteer)
    );

    if (!embeddingText) {
      console.warn(`No embedding text for volunteer ${volunteerId}`);
      return null;
    }

    const embedding = await generateEmbedding(embeddingText);

    // Store in database
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        embedding_text: embeddingText,
        embedding_vector: embedding,
        embedding_updated_at: new Date().toISOString(),
      })
      .eq('id', volunteerId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store embedding: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error(`Error generating volunteer embedding:`, error);
    throw error;
  }
}

/**
 * Generate and store embedding for an opportunity
 * @param {string} opportunityId - Opportunity UUID
 * @param {Object} opportunity - Opportunity data
 * @returns {Promise<Object>} - Updated opportunity with embedding_vector
 */
export async function generateOpportunityEmbedding(opportunityId, opportunity) {
  try {
    const embeddingText = truncateForEmbedding(
      createOpportunityEmbeddingText(opportunity)
    );

    if (!embeddingText) {
      console.warn(`No embedding text for opportunity ${opportunityId}`);
      return null;
    }

    const embedding = await generateEmbedding(embeddingText);

    // Store in database
    const { data, error } = await supabase
      .from('volunteer_opportunities')
      .update({
        embedding_text: embeddingText,
        embedding_vector: embedding,
        embedding_updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store embedding: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error(`Error generating opportunity embedding:`, error);
    throw error;
  }
}

/**
 * Batch generate embeddings for multiple volunteers
 * @param {Array} volunteers - Array of volunteer objects with id and profile data
 * @returns {Promise<Array>} - Array of updated volunteers
 */
export async function batchGenerateVolunteerEmbeddings(volunteers) {
  try {
    const embeddingTexts = volunteers.map(v =>
      truncateForEmbedding(createVolunteerEmbeddingText(v))
    );

    // Filter out empty texts
    const validPairs = volunteers
      .map((v, i) => ({ volunteer: v, text: embeddingTexts[i], index: i }))
      .filter(pair => pair.text.length > 0);

    if (validPairs.length === 0) {
      console.warn('No valid texts for embedding generation');
      return [];
    }

    // Generate embeddings
    const embeddings = await generateBatchEmbeddings(
      validPairs.map(p => p.text)
    );

    // Prepare update data
    const updateData = validPairs.map((pair, i) => ({
      id: pair.volunteer.id,
      embedding_text: pair.text,
      embedding_vector: embeddings[i],
      embedding_updated_at: new Date().toISOString(),
    }));

    // Batch update in Supabase (upsert if exists)
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(updateData, { onConflict: 'id' })
      .select();

    if (error) {
      throw new Error(`Failed to batch update embeddings: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error in batch embedding generation:', error);
    throw error;
  }
}

/**
 * Batch generate embeddings for multiple opportunities
 * @param {Array} opportunities - Array of opportunity objects
 * @returns {Promise<Array>} - Array of updated opportunities
 */
export async function batchGenerateOpportunityEmbeddings(opportunities) {
  try {
    const embeddingTexts = opportunities.map(o =>
      truncateForEmbedding(createOpportunityEmbeddingText(o))
    );

    // Filter out empty texts
    const validPairs = opportunities
      .map((o, i) => ({ opportunity: o, text: embeddingTexts[i], index: i }))
      .filter(pair => pair.text.length > 0);

    if (validPairs.length === 0) {
      console.warn('No valid texts for embedding generation');
      return [];
    }

    // Generate embeddings
    const embeddings = await generateBatchEmbeddings(
      validPairs.map(p => p.text)
    );

    // Prepare update data
    const updateData = validPairs.map((pair, i) => ({
      id: pair.opportunity.id,
      embedding_text: pair.text,
      embedding_vector: embeddings[i],
      embedding_updated_at: new Date().toISOString(),
    }));

    // Batch update in Supabase
    const { data, error } = await supabase
      .from('volunteer_opportunities')
      .upsert(updateData, { onConflict: 'id' })
      .select();

    if (error) {
      throw new Error(`Failed to batch update embeddings: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error in batch opportunity embedding generation:', error);
    throw error;
  }
}

/**
 * Refresh embeddings for all volunteers
 * Useful when embeddings schema changes or need regeneration
 * @returns {Promise<number>} - Number of embeddings updated
 */
export async function refreshAllVolunteerEmbeddings() {
  try {
    const { data: volunteers, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_role', 'volunteer');

    if (fetchError) {
      throw new Error(`Failed to fetch volunteers: ${fetchError.message}`);
    }

    if (volunteers.length === 0) {
      console.log('No volunteers found to refresh embeddings');
      return 0;
    }

    await batchGenerateVolunteerEmbeddings(volunteers);
    return volunteers.length;
  } catch (error) {
    console.error('Error refreshing volunteer embeddings:', error);
    throw error;
  }
}

/**
 * Refresh embeddings for all opportunities
 * @returns {Promise<number>} - Number of embeddings updated
 */
export async function refreshAllOpportunityEmbeddings() {
  try {
    const { data: opportunities, error: fetchError } = await supabase
      .from('volunteer_opportunities')
      .select('*')
      .eq('is_deleted', false);

    if (fetchError) {
      throw new Error(`Failed to fetch opportunities: ${fetchError.message}`);
    }

    if (opportunities.length === 0) {
      console.log('No opportunities found to refresh embeddings');
      return 0;
    }

    await batchGenerateOpportunityEmbeddings(opportunities);
    return opportunities.length;
  } catch (error) {
    console.error('Error refreshing opportunity embeddings:', error);
    throw error;
  }
}

/**
 * Get all volunteers with embeddings for matching
 * @returns {Promise<Array>} - Volunteers with embedding_vector
 */
export async function getVolunteersWithEmbeddings() {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, bio, skills, embedding_vector')
      .eq('user_role', 'volunteer')
      .not('embedding_vector', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch volunteers: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching volunteers with embeddings:', error);
    throw error;
  }
}

/**
 * Get all opportunities with embeddings for matching
 * @returns {Promise<Array>} - Opportunities with embedding_vector
 */
export async function getOpportunitiesWithEmbeddings() {
  try {
    const { data, error } = await supabase
      .from('volunteer_opportunities')
      .select('id, title, description, required_skills, embedding_vector')
      .eq('is_deleted', false)
      .not('embedding_vector', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch opportunities: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching opportunities with embeddings:', error);
    throw error;
  }
}

/**
 * Store match result in database
 * @param {string} volunteerId - Volunteer UUID
 * @param {string} opportunityId - Opportunity UUID
 * @param {Object} scores - Match scores object
 * @returns {Promise<Object>} - Created match result
 */
export async function storeMatchResult(volunteerId, opportunityId, scores) {
  try {
    const { data, error } = await supabase
      .from('match_results')
      .insert({
        volunteer_id: volunteerId,
        opportunity_id: opportunityId,
        match_score: scores.matchScore,
        skills_similarity: scores.skillsSimilarity,
        bio_similarity: scores.bioSimilarity,
        availability_match: scores.availabilityMatch,
        viewed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store match result: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error storing match result:', error);
    throw error;
  }
}

/**
 * Get previous matches for a volunteer
 * @param {string} volunteerId - Volunteer UUID
 * @returns {Promise<Array>} - Match history
 */
export async function getVolunteerMatchHistory(volunteerId) {
  try {
    const { data, error } = await supabase
      .from('match_results')
      .select('*, volunteer_opportunities(title, organization_name)')
      .eq('volunteer_id', volunteerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch match history: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching match history:', error);
    throw error;
  }
}

/**
 * Update match result with application/success data
 * @param {string} matchResultId - Match result UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated match result
 */
export async function updateMatchResult(matchResultId, updates) {
  try {
    const { data, error } = await supabase
      .from('match_results')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchResultId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update match result: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error updating match result:', error);
    throw error;
  }
}
