// netlify/functions/process-lead.js
// Unified function: Lead capture + Email automation + Lead scoring + Tier assignment

const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const formData = JSON.parse(event.body);
    console.log('Received form data:', formData);

    // Initialize services
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_TOKEN 
    }).base(process.env.AIRTABLE_BASE_ID);

    // Determine form type and handle accordingly
    const isSimpleForm = formData.formType && ['contact', 'popup', 'lead-magnet', 'landing-popup', 'exit-intent'].includes(formData.formType);
    
    if (isSimpleForm) {
      // Handle new simple forms (lead magnets, contact forms)
      return await handleSimpleForm(formData, base, headers);
    } else {
      // Handle complex lead qualification forms (with scoring)
      return await handleQualificationForm(formData, base, headers);
    }

  } catch (error) {
    console.error('Processing error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};

// Handle simple forms (contact, lead magnet, etc.)
async function handleSimpleForm(formData, base, headers) {
  try {
    // Save to Airtable
    const airtableRecord = await base('Leads').create({
      Email: formData.email,
      'First Name': formData.first_name || formData.name || '',
      'Last Name': formData.last_name || '',
      Phone: formData.phone || '',
      'Form Type': formData.formType,
      Interest: formData.interest || '',
      Status: formData.status || '',
      Challenge: formData.challenge || '',
      'Privacy Consent': formData.privacy ? 'Yes' : 'No',
      'Updates Consent': formData.updates ? 'Yes' : 'No',
      'Email Sent': false,
      'Lead Source': 'Website Form',
      'Priority Score': 0,
      'Tier': 'GENERAL'
    });

    console.log('Saved to Airtable:', airtableRecord.id);

    // Send email
    const isLeadMagnet = ['lead-magnet', 'exit-intent', 'landing-popup'].includes(formData.formType);
    
    const emailData = {
      to: formData.email,
      from: {
        email: 'tech@skillaipath.com',
        name: 'Viresh - Skill AI Path'
      },
      subject: isLeadMagnet 
        ? '🎁 Your Enterprise Revenue Forecasting Blueprint is Ready'
        : '✅ Application Received - Track Assignment in Progress',
      html: isLeadMagnet ? getBlueprintEmail(formData) : getApplicationEmail(formData)
    };

    await sgMail.send(emailData);
    console.log('Email sent successfully');

    // Update Airtable to mark email as sent
    await base('Leads').update(airtableRecord.id, { 'Email Sent': true });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Form submitted and email sent successfully',
        recordId: airtableRecord.id,
        formType: formData.formType
      })
    };

  } catch (error) {
    console.error('Simple form error:', error);
    throw error;
  }
}

// Handle complex qualification forms (with lead scoring)
async function handleQualificationForm(formData, base, headers) {
  try {
    // Validate required fields for qualification forms
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

    // Security verification (if present)
    if (formData.security_answer || formData.human_verification) {
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
    }

    // Calculate student priority score
    const score = calculateStudentPriority(formData);
    const tier = getStudentTier(score);
    
    // Save to Airtable
    const airtableRecord = await base('Leads').create({
      Email: formData.email,
      'First Name': formData.first_name,
      'Last Name': formData.last_name,
      Phone: formData.whatsapp_number,
      'Form Type': 'qualification',
      Interest: formData.most_interested_in,
      Status: formData.current_status,
      Challenge: formData.career_challenge,
      'Privacy Consent': 'Yes',
      'Updates Consent': 'Yes',
      'Email Sent': false,
      'Lead Source': 'Qualification Form',
      'Priority Score': score,
      'Tier': tier,
      'Previous Courses': formData.previous_courses || '',
      'Additional Context': formData.additional_context || ''
    });

    // Send qualification email
    const emailData = {
      to: formData.email,
      from: {
        email: 'tech@skillaipath.com',
        name: 'Viresh - Skill AI Path'
      },
      subject: `✅ Application Received - ${tier} Track Assignment`,
      html: getQualificationEmail(formData, score, tier)
    };

    await sgMail.send(emailData);
    
    // Update Airtable to mark email as sent
    await base('Leads').update(airtableRecord.id, { 'Email Sent': true });

    // Add calculated fields for backwards compatibility
    const enrichedData = {
      ...formData,
      priority_score: score,
      tier: tier,
      processed_at: new Date().toISOString(),
      ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown',
      user_agent: event.headers['user-agent'] || 'unknown'
    };

    // Send to external webhook if configured
    if (process.env.FORM_WEBHOOK_URL) {
      try {
        await fetch(process.env.FORM_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(enrichedData)
        });
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tier: tier,
        score: score,
        redirectUrl: redirectUrl,
        message: 'Lead processed successfully',
        recordId: airtableRecord.id
      })
    };

  } catch (error) {
    console.error('Qualification form error:', error);
    throw error;
  }
}

// EMAIL TEMPLATES
function getBlueprintEmail(data) {
  const name = data.name || data.first_name || 'there';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .cta-button { 
            background: #667eea; color: white; padding: 15px 30px; text-decoration: none; 
            border-radius: 5px; display: inline-block; margin: 20px 0; font-weight: bold;
        }
        .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎁 Your Enterprise Blueprint is Here!</h1>
            <p>Complete Revenue Forecasting Project Template</p>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            
            <p>Thank you for your interest in building real business solutions! As promised, here's your complete Enterprise Revenue Forecasting Blueprint.</p>
            
            <h3>📦 What's Included:</h3>
            <ul>
                <li>✅ Full architecture diagram & system design</li>
                <li>✅ Python code with Databricks Community edition</li>
                <li>✅ SQL database schema & data pipeline</li>
                <li>✅ Power BI dashboard templates</li>
                <li>✅ Business presentation deck</li>
                <li>✅ Step-by-step implementation guide</li>
            </ul>
            
            <a href="https://github.com/SkillAIPath/Production-Patterns" class="cta-button">📥 Download Complete Blueprint</a>
            
            <p><strong>Next Steps:</strong></p>
            <p>1. Download and review the blueprint<br>
            2. Try implementing the basic structure<br>
            3. Reply with any questions you have</p>
            
            <p>I'll personally review your application for custom track assignment and contact you within 72 hours via WhatsApp/Email.</p>
            
            <div class="signature">
                <p>Best regards,<br>
                <strong>Viresh Gendle</strong><br>
                AI & Cloud Architect<br>
                Skill AI Path<br>
                📞 +91 9301310154<br>
                📧 tech@skillaipath.com</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function getApplicationEmail(data) {
  const name = data.name || data.first_name || 'there';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
        ol { padding-left: 20px; }
        li { margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Application Received!</h1>
            <p>Custom Track Assignment in Progress</p>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            
            <p>Thank you for applying to Skill AI Path! I've received your application and will personally review it for the most suitable track assignment.</p>
            
            <p><strong>What happens next:</strong></p>
            <ol>
                <li>Personal review of your goals and background</li>
                <li>Custom track recommendation based on your needs</li>
                <li>WhatsApp/Email contact within 72 hours</li>
                <li>Discussion of investment options and timeline</li>
            </ol>
            
            <p><strong>While you wait:</strong></p>
            <p>Check out our enterprise code examples: <a href="https://github.com/SkillAIPath/Production-Patterns">GitHub Repository</a></p>
            
            <p>If you have any immediate questions, feel free to reach out directly.</p>
            
            <div class="signature">
                <p>Best regards,<br>
                <strong>Viresh Gendle</strong><br>
                AI & Cloud Architect<br>
                Skill AI Path<br>
                📞 +91 9301310154<br>
                📧 tech@skillaipath.com</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function getQualificationEmail(data, score, tier) {
  const name = data.first_name || 'there';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .tier-badge { background: #ffd700; color: #333; padding: 10px 20px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 15px 0; }
        .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Application Processed!</h1>
            <p>Your Custom Track Assignment is Ready</p>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            
            <p>Thank you for your detailed application! I've personally reviewed your background and goals.</p>
            
            <div class="tier-badge">${tier} - Priority Score: ${score}/100</div>
            
            <p><strong>Your Track Assignment:</strong> ${data.most_interested_in}</p>
            <p><strong>Current Status:</strong> ${data.current_status}</p>
            
            <p><strong>Next Steps:</strong></p>
            <p>1. I'll contact you personally within 24-48 hours<br>
            2. We'll discuss your specific learning path<br>
            3. Custom timeline and investment options<br>
            4. Direct WhatsApp/Phone consultation</p>
            
            <p><strong>Priority Level Benefits:</strong></p>
            <p>✅ Personal mentorship sessions<br>
            ✅ Custom project assignments<br>
            ✅ Direct access to enterprise tools<br>
            ✅ Career placement support</p>
            
            <div class="signature">
                <p>Best regards,<br>
                <strong>Viresh Gendle</strong><br>
                AI & Cloud Architect<br>
                Skill AI Path<br>
                📞 +91 9301310154<br>
                📧 tech@skillaipath.com</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// LEAD SCORING ALGORITHM (Preserved from original)
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

// Tier Determination (Preserved from original)
function getStudentTier(score) {
  if (score >= 85) return 'PRIORITY_QUALIFIED';
  if (score >= 65) return 'STANDARD_QUALIFIED';
  if (score >= 45) return 'BASIC_QUALIFIED';
  return 'GENERAL';
}
