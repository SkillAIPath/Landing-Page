// netlify/functions/process-lead.js
// FINAL PRODUCTION VERSION - Complete lead processing with scoring, emails, and tier assignment

const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET'
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
    console.log('📝 Form submission received:', formData.email, formData.formType);

    // Validate environment variables
    if (!process.env.SENDGRID_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Email service not configured' })
      };
    }

    if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database service not configured' })
      };
    }

    // Initialize services
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_TOKEN 
    }).base(process.env.AIRTABLE_BASE_ID);

    // Determine if this is a simple form or qualification form
    const isSimpleForm = formData.formType && ['contact', 'popup', 'lead-magnet', 'landing-popup', 'exit-intent'].includes(formData.formType);
    
    if (isSimpleForm) {
      return await handleSimpleForm(formData, base, headers);
    } else {
      return await handleQualificationForm(formData, base, headers);
    }

  } catch (error) {
    console.error('❌ Processing error:', error);
    
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
    console.log('📋 Processing simple form:', formData.formType);

    // Map form data to Airtable fields
    const recordData = {
      'Email': formData.email,
      'First Name': formData.first_name || formData.name || '',
      'Last Name': formData.last_name || '',
      'Phone': formData.phone || '',
      'Interest': formData.interest || '',
      'Status': formData.status || '',
      'Challenge': formData.challenge || '',
      'Form Type': formData.formType || 'contact',
      'Email Sent': false,
      'Lead Source': 'Website Form',
      'Priority Score': 0,
      'Tier': 'GENERAL',
      'Created Date': new Date().toISOString()
    };

    // Add consent fields if present
    if (formData.privacy !== undefined) {
      recordData['Privacy Consent'] = formData.privacy ? 'Yes' : 'No';
    }
    if (formData.updates !== undefined) {
      recordData['Updates Consent'] = formData.updates ? 'Yes' : 'No';
    }

    // Save to Airtable
    const airtableRecord = await base('Leads').create(recordData);
    console.log('✅ Airtable record created:', airtableRecord.id);

    // Send email
    const isLeadMagnet = ['lead-magnet', 'exit-intent', 'landing-popup'].includes(formData.formType);
    
    try {
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
      console.log('✅ Email sent successfully to:', formData.email);

      // Update Airtable to mark email as sent
      await base('Leads').update(airtableRecord.id, { 'Email Sent': true });

    } catch (emailError) {
      console.error('⚠️ Email sending failed:', emailError.message);
      // Continue without failing the whole process
    }

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
    console.error('❌ Simple form error:', error);
    throw error;
  }
}

// Handle complex qualification forms (with lead scoring)
async function handleQualificationForm(formData, base, headers) {
  try {
    console.log('🎯 Processing qualification form');

    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email'];
    
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

    // Calculate student priority score
    const score = calculateStudentPriority(formData);
    const tier = getStudentTier(score);
    
    console.log('📊 Calculated score:', score, 'tier:', tier);

    // Map qualification form data to Airtable
    const recordData = {
      'Email': formData.email,
      'First Name': formData.first_name,
      'Last Name': formData.last_name,
      'Phone': formData.phone || '',
      'Interest': formData.interest || '',
      'Status': formData.status || '',
      'Challenge': formData.challenge || '',
      'Form Type': 'qualification',
      'Email Sent': false,
      'Lead Source': 'Qualification Form',
      'Priority Score': score,
      'Tier': tier,
      'Privacy Consent': 'Yes',
      'Updates Consent': 'Yes',
      'Created Date': new Date().toISOString()
    };

    // Save to Airtable
    const airtableRecord = await base('Leads').create(recordData);
    console.log('✅ Qualification record created:', airtableRecord.id);

    // Send qualification email
    try {
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
      console.log('✅ Qualification email sent');
      
      // Update Airtable to mark email as sent
      await base('Leads').update(airtableRecord.id, { 'Email Sent': true });

    } catch (emailError) {
      console.error('⚠️ Email sending failed:', emailError.message);
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
    console.error('❌ Qualification form error:', error);
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
            
            <p><strong>Your Application Details:</strong></p>
            <p>📧 Email: ${data.email}<br>
            👤 Name: ${data.first_name} ${data.last_name || ''}<br>
            🎯 Interest: ${data.interest || 'Not specified'}<br>
            📋 Status: ${data.status || 'Not specified'}</p>
            
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
            
            <p><strong>Your Track Assignment:</strong> ${data.interest || 'Custom track based on consultation'}</p>
            <p><strong>Current Status:</strong> ${data.status || 'Not specified'}</p>
            
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

// LEAD SCORING ALGORITHM
function calculateStudentPriority(formData) {
  let score = 0;
  
  // 1. CURRENT STATUS (40 points max) - Most Important
  const statusScores = {
    'College Student': 40,
    'Recent Graduate': 35,
    'Looking for Career Change': 25,
    'Working Professional': 20,
    'Senior Professional': 15,
    'Entrepreneur': 10
  };
  score += statusScores[formData.status] || 0;
  
  // 2. PRIMARY INTEREST (30 points max)
  const interestScores = {
    'Build analytics solutions': 30,
    'Create automation systems': 25,
    'Master client delivery': 25,
    'Plan career transition': 20,
    'Need track guidance': 5
  };
  score += interestScores[formData.interest] || 0;
  
  // 3. CAREER CHALLENGE TEXT ANALYSIS (25 points max)
  const challenge = (formData.challenge || '').toLowerCase();
  
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
  
  // 4. EMAIL DOMAIN ANALYSIS (5 points max)
  const email = formData.email.toLowerCase();
  if (email.includes('.edu')) score += 5;
  else if (email.includes('.ac.')) score += 4;
  else if (/iit|nit|bits|iisc|iiith/.test(email)) score += 3;
  else if (email.includes('gmail')) score += 1;
  
  return Math.min(score, 100);
}

// Tier Determination
function getStudentTier(score) {
  if (score >= 85) return 'PRIORITY_QUALIFIED';
  if (score >= 65) return 'STANDARD_QUALIFIED';
  if (score >= 45) return 'BASIC_QUALIFIED';
  return 'GENERAL';
}
