// netlify/functions/process-lead.js
// Enhanced function with Supabase database integration

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  // Handle CORS for all requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only handle POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // Parse the form data
    let formData;
    try {
      formData = JSON.parse(event.body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON format',
          redirectUrl: '/?error=invalid_format'
        })
      };
    }
    
    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'whatsapp_number', 'most_interested_in', 'current_status', 'career_challenge'];
    
    for (const field of requiredFields) {
      if (!formData[field] || formData[field].trim() === '') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: `Missing required field: ${field}`,
            redirectUrl: '/?error=missing_fields'
          })
        };
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid email format',
          redirectUrl: '/?error=invalid_email'
        })
      };
    }

    // Security verification
    const expectedAnswer = formData.form_type === 'popup' ? '15' : '12';
    if (formData.security_answer !== expectedAnswer || !formData.human_verification) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Security verification failed',
          redirectUrl: '/?error=security_failed'
        })
      };
    }

    // Calculate student priority score
    const score = calculateStudentPriority(formData);
    const tier = getStudentTier(score);
    
    // Prepare data for database insertion
    const leadData = {
      // Personal Information
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      email: formData.email.toLowerCase().trim(),
      whatsapp_number: formData.whatsapp_number.trim(),
      
      // Application Information
      most_interested_in: formData.most_interested_in,
      current_status: formData.current_status,
      heard_about_us: formData.heard_about_us,
      previous_courses: formData.previous_courses,
      career_challenge: formData.career_challenge.trim(),
      additional_context: formData.additional_context ? formData.additional_context.trim() : null,
      
      // Consent and Privacy
      privacy_consent: formData.privacy_consent === 'on' || formData.privacy_consent === true,
      updates_consent: formData.updates_consent === 'on' || formData.updates_consent === true,
      
      // Calculated Fields
      priority_score: score,
      tier: tier,
      
      // Technical Information
      form_type: formData.form_type || 'main',
      ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown',
      user_agent: event.headers['user-agent'] || 'unknown',
      page_url: formData.page_url || 'unknown',
      
      // Timestamps
      submission_timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      
      // Status
      status: 'new',
      contacted: false,
      notes: null
    };

    // Insert into Supabase database
    const { data: insertedData, error: dbError } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single();

    if (dbError) {
      console.error('Database insertion error:', dbError);
      
      // Still continue with the process even if database fails
      // This ensures user experience isn't affected by database issues
    } else {
      console.log('Successfully inserted lead:', insertedData.id);
    }

    // Send to external webhook (optional - for CRM integration)
    if (process.env.FORM_WEBHOOK_URL) {
      try {
        const webhookResponse = await fetch(process.env.FORM_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...leadData,
            database_id: insertedData?.id || null
          })
        });
        
        if (!webhookResponse.ok) {
          console.error('Webhook failed:', webhookResponse.status);
        }
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
        // Continue processing even if webhook fails
      }
    }

    // Determine redirect URL based on tier
    const redirectUrls = {
      'PRIORITY_QUALIFIED': '/booking-pages/priority-qualified.html',
      'STANDARD_QUALIFIED': '/booking-pages/standard-qualified.html',
      'BASIC_QUALIFIED': '/booking-pages/basic-qualified.html',
      'GENERAL': '/booking-pages/general-webinar.html'
    };

    const redirectUrl = redirectUrls[tier] || redirectUrls['GENERAL'];

    // Return success response with redirect
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tier: tier,
        score: score,
        redirectUrl: redirectUrl,
        message: 'Lead processed and stored successfully',
        lead_id: insertedData?.id || null
      })
    };

  } catch (error) {
    console.error('Processing error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        redirectUrl: '/?error=processing_failed'
      })
    };
  }
};

// Student Priority Scoring Algorithm
function calculateStudentPriority(formData) {
  let score = 0;
  
  // 1. CURRENT STATUS (40 points max) - Most Important
  const statusScores = {
    'College Student': 40,
    'Recent Graduate (0-2 years)': 35,
    'Looking for Career Change': 25,
    'Current Freelancer': 20,
    'Working Professional (2-5 years)': 15,
    'Senior Professional (5+ years)': 10
  };
  score += statusScores[formData.current_status] || 0;
  
  // 2. PRIMARY INTEREST (30 points max)
  const interestScores = {
    'Complete Stack (All 6 Tracks)': 30,
    'Data Analytics Track': 25,
    'Data Engineering Track': 25,
    'MLOps Track': 20,
    'Career Transformation': 15,
    'Freelancing Program': 10,
    'Not Sure / Need Guidance': 5
  };
  score += interestScores[formData.most_interested_in] || 0;
  
  // 3. PREVIOUS LEARNING EXPERIENCE (20 points max)
  const courseScores = {
    'Paid courses (didn\'t complete)': 20,
    'Completed other courses': 18,
    'Attended bootcamp/program': 15,
    'Only free courses': 10,
    'No, this is my first': 8
  };
  score += courseScores[formData.previous_courses] || 0;
  
  // 4. CAREER CHALLENGE TEXT ANALYSIS (25 points max)
  const challenge = (formData.career_challenge || '').toLowerCase();
  
  // Length quality
  if (challenge.length > 150) score += 15;
  else if (challenge.length > 75) score += 10;
  else if (challenge.length > 30) score += 5;
  
  // Student keywords
  const studentKeywords = ['placement', 'campus', 'internship', 'fresher', 'graduate', 'college', 'university', 'student', 'final year', 'job ready'];
  studentKeywords.forEach(keyword => {
    if (challenge.includes(keyword)) score += 3;
  });
  
  // Urgency indicators
  const urgencyKeywords = ['urgent', 'asap', 'soon', 'immediate', 'deadline', 'interview', 'opportunity', 'confused', 'lost', 'direction'];
  urgencyKeywords.forEach(keyword => {
    if (challenge.includes(keyword)) score += 2;
  });
  
  // 5. EMAIL DOMAIN ANALYSIS (15 points max)
  const email = formData.email.toLowerCase();
  if (email.includes('.edu')) score += 15;
  else if (email.includes('.ac.')) score += 12;
  else if (/iit|nit|bits|iisc|iiith/.test(email)) score += 10;
  else if (email.includes('gmail')) score += 3;
  
  // 6. ADDITIONAL CONTEXT BONUS (10 points max)
  const additional = (formData.additional_context || '').toLowerCase();
  if (additional.length > 50) score += 5;
  if (/serious|committed|dedicated|focused/.test(additional)) score += 5;
  
  return Math.min(score, 100);
}

// Tier Determination
function getStudentTier(score) {
  if (score >= 85) return 'PRIORITY_QUALIFIED';
  if (score >= 65) return 'STANDARD_QUALIFIED';
  if (score >= 45) return 'BASIC_QUALIFIED';
  return 'GENERAL';
}