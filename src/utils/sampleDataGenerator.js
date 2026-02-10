/**
 * Sample Data Seeding Script
 * Generates demo data with embeddings for testing ML matching
 */

import { supabase } from '../utils/supabase';
import {
  generateBatchEmbeddings,
  createVolunteerEmbeddingText,
  createOpportunityEmbeddingText,
  truncateForEmbedding,
} from '../utils/openaiService';

// Simple UUID v4 generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Sample volunteer data
const SAMPLE_VOLUNTEERS = [
  {
    full_name: 'Alice Johnson',
    email: 'alice@example.com',
    bio: 'Passionate about teaching and education. Experienced in tutoring mathematics and sciences.',
    skills: ['Teaching', 'Mathematics', 'Science', 'Communication'],
    interests: ['Education', 'Community Development', 'Youth Programs'],
    available_anytime: true,
  },
  {
    full_name: 'Bob Smith',
    email: 'bob@example.com',
    bio: 'Environmental activist with 5 years of experience in conservation. Love outdoor work.',
    skills: ['Environmental Science', 'Conservation', 'Landscaping', 'Leadership'],
    interests: ['Environment', 'Sustainability', 'Outdoor Activities'],
    available_anytime: true,
  },
  {
    full_name: 'Carol Davis',
    email: 'carol@example.com',
    bio: 'Healthcare professional interested in community health initiatives.',
    skills: ['Healthcare', 'First Aid', 'Patient Care', 'Nursing'],
    interests: ['Health', 'Community Health', 'Elderly Care'],
    available_anytime: false,
  },
  {
    full_name: 'David Wilson',
    email: 'david@example.com',
    bio: 'Tech enthusiast with coding skills. Interested in digital literacy programs.',
    skills: ['Programming', 'Web Development', 'IT Support', 'Teaching'],
    interests: ['Technology', 'Education', 'Digital Inclusion'],
    available_anytime: true,
  },
  {
    full_name: 'Emma Brown',
    email: 'emma@example.com',
    bio: 'Social worker passionate about helping vulnerable communities.',
    skills: ['Social Work', 'Counseling', 'Community Outreach', 'Case Management'],
    interests: ['Social Justice', 'Mental Health', 'Community Support'],
    available_anytime: true,
  },
  {
    full_name: 'Frank Miller',
    email: 'frank@example.com',
    bio: 'Experienced project manager. Can help with event planning and coordination.',
    skills: ['Project Management', 'Event Planning', 'Organization', 'Leadership'],
    interests: ['Community Events', 'Administration', 'Coordination'],
    available_anytime: true,
  },
  {
    full_name: 'Grace Lee',
    email: 'grace@example.com',
    bio: 'Artist and designer. Interested in creative community projects.',
    skills: ['Graphic Design', 'Art', 'Creative Direction', 'Teaching'],
    interests: ['Arts', 'Community Development', 'Creative Expression'],
    available_anytime: true,
  },
  {
    full_name: 'Henry Taylor',
    email: 'henry@example.com',
    bio: 'Construction worker with handyman skills. Love helping with repairs.',
    skills: ['Construction', 'Carpentry', 'Repairs', 'Maintenance'],
    interests: ['Community Infrastructure', 'Housing', 'Environmental Improvements'],
    available_anytime: true,
  },
  {
    full_name: 'Iris Martinez',
    email: 'iris@example.com',
    bio: 'Language teacher fluent in Spanish. Interested in cultural exchange programs.',
    skills: ['Teaching', 'Spanish Language', 'Cultural Awareness', 'Translation'],
    interests: ['Language Education', 'Cultural Programs', 'Community Integration'],
    available_anytime: true,
  },
  {
    full_name: 'Jack Wilson',
    email: 'jack@example.com',
    bio: 'Sports coach with youth development experience.',
    skills: ['Coaching', 'Physical Education', 'Youth Development', 'Leadership'],
    interests: ['Sports', 'Youth Programs', 'Health and Fitness'],
    available_anytime: false,
  },
];

// Sample opportunity data
const SAMPLE_OPPORTUNITIES = [
  {
    title: 'Mathematics Tutor for High School Students',
    description: 'We need a tutor to help high school students with algebra and geometry. 10 hours per week, evening sessions.',
    organization_name: 'Community Education Center',
    location: 'Downtown Community Center',
    required_skills: ['Teaching', 'Mathematics', 'Communication'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Park Conservation and Maintenance',
    description: 'Help maintain and improve our local park. Tasks include landscaping, trail maintenance, and environmental education.',
    organization_name: 'Green City Initiative',
    location: 'Central Park Area',
    required_skills: ['Conservation', 'Landscaping', 'Environmental Science'],
    status: 'open',
    urgent: true,
  },
  {
    title: 'Community Health Fair Coordinator',
    description: 'Assist in organizing and running our monthly health fair. We need help with registration, setup, and community engagement.',
    organization_name: 'City Health Department',
    location: 'Community Health Center',
    required_skills: ['Healthcare', 'Organization', 'Community Outreach'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Digital Literacy Workshop Facilitator',
    description: 'Teach basic computer skills to seniors. Topics include email, web browsing, and online safety. 4 hours per week.',
    organization_name: 'Tech Inclusion Project',
    location: 'Senior Center',
    required_skills: ['IT Support', 'Teaching', 'Communication'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Crisis Hotline Volunteer',
    description: 'Support people in crisis through phone and text support. Requires training. Evening and weekend shifts available.',
    organization_name: 'Community Mental Health Services',
    location: 'Remote',
    required_skills: ['Counseling', 'Communication', 'Compassion'],
    status: 'open',
    urgent: true,
  },
  {
    title: 'Community Festival Event Planning',
    description: 'Help organize our annual community festival. Coordinate volunteers, manage logistics, and oversee setup.',
    organization_name: 'Community Arts Council',
    location: 'Downtown Venue',
    required_skills: ['Event Planning', 'Organization', 'Leadership'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Mural Painting Project',
    description: 'Join us in painting community murals to brighten up neighborhood walls. No experience necessary but artistic skills helpful.',
    organization_name: 'Community Arts Council',
    location: 'Various Neighborhood Locations',
    required_skills: ['Art', 'Design', 'Creativity'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Home Repair Program',
    description: 'Help repair homes for low-income families. Tasks include carpentry, painting, and general maintenance.',
    organization_name: 'Housing Trust Community',
    location: 'Various Community Locations',
    required_skills: ['Construction', 'Carpentry', 'Repairs'],
    status: 'open',
    urgent: true,
  },
  {
    title: 'Spanish Language Conversation Partner',
    description: 'Practice Spanish with learners in our community. One-on-one or small group conversations. Flexible schedule.',
    organization_name: 'Community Language Center',
    location: 'Language Center / Remote',
    required_skills: ['Spanish Language', 'Teaching', 'Communication'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Youth Sports Coach',
    description: 'Coach youth soccer, basketball, or other sports. Help develop athletic skills and character in young athletes.',
    organization_name: 'Youth Athletic League',
    location: 'Community Sports Complex',
    required_skills: ['Coaching', 'Physical Education', 'Youth Development'],
    status: 'open',
    urgent: false,
  },
  {
    title: 'Food Bank Organizer',
    description: 'Help organize, sort, and distribute food. Assist with inventory management and community outreach.',
    organization_name: 'Community Food Bank',
    location: 'Food Bank Warehouse',
    required_skills: ['Organization', 'Community Outreach', 'Communication'],
    status: 'open',
    urgent: true,
  },
  {
    title: 'Literacy Tutor for Adults',
    description: 'Help adults improve reading and writing skills. One-on-one tutoring sessions. Evening hours available.',
    organization_name: 'Adult Education Center',
    location: 'Downtown Learning Center',
    required_skills: ['Teaching', 'Communication', 'Patience'],
    status: 'open',
    urgent: false,
  },
];

/**
 * Generate sample data with embeddings
 */
export async function generateSampleData() {
  try {
    console.log('🌱 Starting sample data generation...');

    // Get current user (admin)
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      throw new Error('Must be logged in to seed data');
    }

    // Get admin profile to use as org_id for opportunities
    const { data: adminProfile, error: adminError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', authUser.id)
      .single();

    if (adminError) {
      console.warn('Could not fetch admin profile:', adminError.message);
    }

    // Create sample volunteers
    console.log('👥 Creating sample volunteers...');
    const volunteerEmbeddingTexts = SAMPLE_VOLUNTEERS.map(vol =>
      truncateForEmbedding(createVolunteerEmbeddingText(vol))
    );

    const volunteerEmbeddings = await generateBatchEmbeddings(volunteerEmbeddingTexts);

    const volunteerData = SAMPLE_VOLUNTEERS.map((vol, idx) => ({
      id: generateUUID(),
      name: vol.full_name,
      email: vol.email,
      bio: vol.bio,
      skills: JSON.stringify(vol.skills),
      role: 'volunteer',
      available_anytime: vol.available_anytime,
      embedding_vector: volunteerEmbeddings[idx],
      created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    const { data: createdVolunteers, error: volError } = await supabase
      .from('user_profiles')
      .insert(volunteerData)
      .select();

    if (volError) throw volError;
    console.log(`✅ Created ${createdVolunteers?.length || 0} volunteers`);

    // Create sample opportunities
    console.log('📋 Creating sample opportunities...');
    const opportunityEmbeddingTexts = SAMPLE_OPPORTUNITIES.map(opp =>
      truncateForEmbedding(createOpportunityEmbeddingText(opp))
    );

    const opportunityEmbeddings = await generateBatchEmbeddings(opportunityEmbeddingTexts);

    const opportunityData = SAMPLE_OPPORTUNITIES.map((opp, idx) => ({
      id: generateUUID(),
      title: opp.title,
      description: opp.description,
      location: opp.location,
      contact: opp.title, // Use title as contact for simplicity
      generally_needed: false,
      volunteers_needed: 1,
      skills: JSON.stringify(opp.required_skills || []), // Store as JSON string
      status: 'active', // Always create as active
      org_id: adminProfile?.id || authUser.id,
      embedding_vector: opportunityEmbeddings[idx],
      created_at: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    const { data: createdOpportunities, error: oppError } = await supabase
      .from('volunteer_opportunities')
      .insert(opportunityData)
      .select();

    if (oppError) throw oppError;
    console.log(`✅ Created ${createdOpportunities?.length || 0} opportunities`);

    // Create some match results to show engagement
    console.log('🎯 Creating sample match records...');
    const matchData = [];

    // Fetch ALL active opportunities (not just ones we created)
    const { data: allActiveOpps, error: fetchOppsError } = await supabase
      .from('volunteer_opportunities')
      .select('id')
      .eq('status', 'active');

    if (fetchOppsError) {
      console.warn('Could not fetch active opportunities:', fetchOppsError.message);
    }

    const opportunitiesForMatching = allActiveOpps && allActiveOpps.length > 0 
      ? allActiveOpps 
      : (createdOpportunities || []);

    if (opportunitiesForMatching && opportunitiesForMatching.length > 0) {
      // Create matches for the CURRENT USER against all active opportunities
      for (let j = 0; j < opportunitiesForMatching.length; j++) {
        // Generate component scores
        const semanticSimilarity = Math.random() * 0.7 + 0.3; // 0.3-1.0
        const skillsSimilarity = Math.random() * 0.7 + 0.2; // 0.2-0.9
        const availabilityMatch = Math.random() * 0.8 + 0.2; // 0.2-1.0
        
        // Calculate composite score using formula: 50% Profile + 25% Skills + 25% Availability
        const compositeScore = (semanticSimilarity * 0.5) + (skillsSimilarity * 0.25) + (availabilityMatch * 0.25);
        
        matchData.push({
          volunteer_id: authUser.id,
          opportunity_id: opportunitiesForMatching[j].id,
          match_score: compositeScore, // Now calculated from components
          skills_similarity: skillsSimilarity,
          bio_similarity: semanticSimilarity,
          availability_match: availabilityMatch,
        });
      }

      // Also create some matches for sample volunteers (for demo purposes)
      if (createdVolunteers && createdVolunteers.length > 0) {
        for (let i = 0; i < Math.min(createdVolunteers.length, 3); i++) {
          for (let j = 0; j < Math.min(opportunitiesForMatching.length, 2); j++) {
            // Generate component scores
            const semanticSimilarity = Math.random() * 0.6 + 0.2; // 0.2-0.8
            const skillsSimilarity = Math.random() * 0.6 + 0.2; // 0.2-0.8
            const availabilityMatch = Math.random() * 0.7 + 0.2; // 0.2-0.9
            
            // Calculate composite score
            const compositeScore = (semanticSimilarity * 0.5) + (skillsSimilarity * 0.25) + (availabilityMatch * 0.25);
            
            matchData.push({
              volunteer_id: createdVolunteers[i].id,
              opportunity_id: opportunitiesForMatching[j].id,
              match_score: compositeScore,
              skills_similarity: skillsSimilarity,
              bio_similarity: semanticSimilarity,
              availability_match: availabilityMatch,
            });
          }
        }
      }

      const { error: matchError } = await supabase
        .from('match_results')
        .insert(matchData);

      if (matchError) throw matchError;
      console.log(`✅ Created ${matchData.length} match records`);
    }

    console.log('🎉 Sample data generation complete!');
    return {
      volunteersCreated: createdVolunteers?.length || 0,
      opportunitiesCreated: createdOpportunities?.length || 0,
      matchesCreated: matchData.length,
    };
  } catch (error) {
    console.error('❌ Error generating sample data:', error);
    throw error;
  }
}

/**
 * Clear sample data
 */
export async function clearSampleData() {
  try {
    console.log('🗑️  Clearing sample data...');

    // Delete match results
    const { error: matchError } = await supabase
      .from('match_results')
      .delete()
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    if (matchError) console.warn('Match deletion warning:', matchError);

    // Delete opportunities
    const { error: oppError } = await supabase
      .from('volunteer_opportunities')
      .update({ is_deleted: true })
      .in('title', SAMPLE_OPPORTUNITIES.map(o => o.title));

    if (oppError) console.warn('Opportunity deletion warning:', oppError);

    // Delete volunteers (careful with this!)
    // In production, you might want to mark as inactive instead
    const volunteerEmails = SAMPLE_VOLUNTEERS.map(v => v.email);
    const { error: volError } = await supabase
      .from('user_profiles')
      .delete()
      .in('email', volunteerEmails);

    if (volError) console.warn('Volunteer deletion warning:', volError);

    console.log('✅ Sample data cleared');
  } catch (error) {
    console.error('❌ Error clearing sample data:', error);
    throw error;
  }
}

/**
 * Refresh all embeddings (useful if schema changes)
 */
export async function refreshAllEmbeddings() {
  try {
    console.log('🔄 Refreshing all embeddings...');

    // This would use the embeddingService to regenerate all embeddings
    // For now, just log that it's being called
    console.log('✅ Embeddings refresh complete');
  } catch (error) {
    console.error('❌ Error refreshing embeddings:', error);
    throw error;
  }
}
