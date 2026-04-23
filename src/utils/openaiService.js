/**
 * OpenAI Service for ML Matching
 * Handles embedding generation and similarity calculations
 */

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;

/**
 * Generate embedding vector for text using OpenAI API
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - 1536-dimensional embedding vector
 * @throws {Error} - If API key missing or request fails
 */
export async function generateEmbedding(text) {
  if (!OPENAI_API_KEY) {
    throw new Error('VITE_OPENAI_API_KEY not configured in .env.local');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty for embedding generation');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.substring(0, 8191), // API has 8191 char limit per input
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid response format from OpenAI API');
    }

    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Formula: (A · B) / (||A|| × ||B||)
 * @param {number[]} vectorA - First embedding vector
 * @param {number[]} vectorB - Second embedding vector
 * @returns {number} - Similarity score between 0 and 1
 */
export function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have same dimensions');
  }

  // Dot product
  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  // Magnitude of A
  let magnitudeA = 0;
  for (let i = 0; i < vectorA.length; i++) {
    magnitudeA += vectorA[i] * vectorA[i];
  }
  magnitudeA = Math.sqrt(magnitudeA);

  // Magnitude of B
  let magnitudeB = 0;
  for (let i = 0; i < vectorB.length; i++) {
    magnitudeB += vectorB[i] * vectorB[i];
  }
  magnitudeB = Math.sqrt(magnitudeB);

  // Avoid division by zero
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Generate batch embeddings for multiple texts (more efficient)
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function generateBatchEmbeddings(texts) {
  if (!OPENAI_API_KEY) {
    throw new Error('VITE_OPENAI_API_KEY not configured in .env.local');
  }

  if (!texts || texts.length === 0) {
    throw new Error('Texts array cannot be empty');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts.map(text => text.substring(0, 8191)), // Truncate long texts
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from OpenAI API');
    }

    // Sort by index to maintain order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    throw error;
  }
}

/**
 * Calculate embedding text from volunteer profile
 * Concatenates relevant fields for semantic understanding
 * @param {Object} volunteer - Volunteer profile object
 * @returns {string} - Concatenated text for embedding
 */
export function createVolunteerEmbeddingText(volunteer) {
  const parts = [
    volunteer.full_name || '',
    volunteer.bio || '',
    volunteer.skills?.join(' ') || '',
    volunteer.interests?.join(' ') || '',
    volunteer.organization_name || '',
  ];
  
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Calculate embedding text from opportunity
 * @param {Object} opportunity - Opportunity object
 * @returns {string} - Concatenated text for embedding
 */
export function createOpportunityEmbeddingText(opportunity) {
  const parts = [
    opportunity.title || '',
    opportunity.description || '',
    opportunity.organization_name || '',
    opportunity.location || '',
    Array.isArray(opportunity.required_skills)
      ? opportunity.required_skills.join(' ')
      : opportunity.required_skills || '',
  ];
  
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Calculate composite match score from multiple similarity metrics
 * @param {Object} scores - Object with individual similarity scores
 * @param {number} scores.semanticSimilarity - Semantic similarity (0-1)
 * @param {number} scores.skillsSimilarity - Skills overlap (0-1)
 * @param {number} scores.availabilitySimilarity - Availability match (0-1)
 * @param {Object} weights - Weighting for different factors
 * @returns {number} - Final match score (0-100)
 */
export function calculateCompositeMatchScore(scores, weights = {}) {
  const defaultWeights = {
    semantic: 0.5,      // Semantic similarity most important
    skills: 0.25,       // Skills match
    availability: 0.25, // Availability match
  };

  const finalWeights = { ...defaultWeights, ...weights };

  const composite =
    (scores.semanticSimilarity || 0) * finalWeights.semantic +
    (scores.skillsSimilarity || 0) * finalWeights.skills +
    (scores.availabilitySimilarity || 0) * finalWeights.availability;

  // Return as percentage (0-100) rounded to 2 decimals
  return Math.round(composite * 100 * 100) / 100;
}

/**
 * Truncate text for embedding (API has limits)
 * @param {string} text - Text to truncate
 * @param {number} maxChars - Maximum characters (default 8000)
 * @returns {string} - Truncated text
 */
export function truncateForEmbedding(text, maxChars = 8000) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '...';
}

/**
 * Validate embedding vector format
 * @param {*} embedding - Value to validate
 * @returns {boolean} - True if valid embedding vector
 */
export function isValidEmbedding(embedding) {
  return (
    Array.isArray(embedding) &&
    embedding.length === EMBEDDING_DIMENSION &&
    embedding.every(num => typeof num === 'number' && !isNaN(num))
  );
}

/**
 * Parse stored embedding vector from database
 * If stored as JSON string or array, ensures it's properly formatted
 * @param {*} storedEmbedding - Embedding from database
 * @returns {number[]} - Parsed embedding vector
 */
export function parseEmbedding(storedEmbedding) {
  if (!storedEmbedding) return null;

  if (Array.isArray(storedEmbedding)) {
    return storedEmbedding;
  }

  if (typeof storedEmbedding === 'string') {
    try {
      return JSON.parse(storedEmbedding);
    } catch {
      return null;
    }
  }

  return null;
}
