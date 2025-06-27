// netlify/functions/process-lead.js
// Complete Airtable + Email integration with debugging

const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

exports.handler = async (event, context) => {
  // CORS headers for cross-origin requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ message: 'CORS preflight' })
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: "Method not allowed",
        allowed: "POST"
      })
    };
  }

  try {
    console.log('=== FUNCTION START ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Event headers:', event.headers);
    console.log('Event body length:', event.body?.length);

    // Parse form data
    let formData;
    try {
      formData = JSON.parse(event.body);
      console.log('Parsed form data keys:', Object.keys(formData));
      console.log('Form data:', JSON.stringify(formData, null, 2));
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON format',
          details: parseError.message
        })
      };
    }

    // Environment variables validation
    console.log('=== ENVIRONMENT CHECK ===');
    const envCheck = {
      AIRTABLE_TOKEN: !!process.env.AIRTABLE_TOKEN,
      AIRTABLE_BASE_ID: !!process.env.AIRTABLE_BASE_ID,
      SENDGRID_API_KEY: !!process.env.SENDGRID_API_KEY
    };
    console.log('Environment variables:', envCheck);

    if (!process.env.AIRTABLE_TOKEN) {
      throw new Error('AIRTABLE_TOKEN environment variable not configured');
    }

    if (!process.env.AIRTABLE_BASE_ID) {
      throw new Error('AIRTABLE_BASE_ID environment variable not configured');
    }

    // Initialize Airtable connection
    console.log('=== AIRTABLE INITIALIZATION ===');
    let base;
    try {
      base = new Airtable({ 
        apiKey: process.env.AIRTABLE_TOKEN 
      }).base(process.env.AIRTABLE_BASE_ID);
      console.log('Airtable base initialized successfully');
    } catch (airtableError) {
      console.error('Airtable initialization error:', airtableError.message);
      throw new Error(`Airtable setup failed: ${airtableError.message}`);
    }

    // Route to appropriate handler based on form type
    const formType = formData.formType || 'unknown';
    const isSimpleForm = ['contact', 'popup', 'lead-magnet', 'landing-popup', 'exit-intent'].includes(formType);
    
    console.log('=== FORM ROUTING ===');
    console.log('Form type detected:', formType);
    console.log('Is simple form:', isSimpleForm);

    if (isSimpleForm) {
      return await handleSimpleForm(formData, base, headers);
    } else {
      return await handleQualificationForm(formData, base, headers);
    }

  } catch (error) {
    console.error('=== FUNCTION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server error occurred',
        message: error.message,
        timestamp: new Date().toISOString(),
        debug: {
          environment: {
            hasAirtableToken: !!process.env.AIRTABLE_TOKEN,
            hasAirtableBase: !!process.env.AIRTABLE_BASE_ID,
            hasSendGrid: !!process.env.SENDGRID_API_KEY
          },
          nodeVersion: process.version,
          functionTimeout: context.getRemainingTimeInMillis?.() || 'unknown'
        }
      })
    };
  }
};

// Handle simple forms (contact, lead magnets, popups)
async function handleSimpleForm(formData, base, headers) {
  try {
    console.log('=== SIMPLE FORM PROCESSING ===');
    console.log('Processing form type:', formData.formType);
    
    // Validate required fields for simple forms
    if (!formData.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Email is required',
          field: 'email'
        })
      };
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid email format',
          field: 'email'
        })
      };
    }

    // Prepare Airtable record
    const timestamp = new Date().toISOString();
    const recordData = {
      'Email': formData.email.trim().toLowerCase(),
      'First Name': formData.first_name?.trim() || formData.name?.trim() || '',
      'Last Name': formData.last_name?.trim() || '',
      'Phone': formData.phone?.trim() || '',
      'Form Type': formData.formType || 'simple',
      'Interest': formData.interest?.trim() || '',
      'Status': formData.status?.trim() || '',
      'Challenge': formData.challenge?.trim() || '',
      'Privacy Consent': formData.privacy ? 'Yes' : 'No',
      'Updates Consent': formData.updates ? 'Yes' : 'No',
      'Email Sent': false,
      'Lead Source': 'Website Form',
      'Priority Score': 0,
      'Tier': 'GENERAL',
      'Created At': timestamp,
      'User Agent': formData.userAgent || 'Unknown',
      'Referrer': formData.referrer || 'Direct'
    };

    console.log('Prepared Airtable record:', JSON.stringify(recordData, null, 2));

    // Create Airtable record
    console.log('=== AIRTABLE CREATE ===');
    let airtableRecord;
    try {
      airtableRecord = await base('Leads').create(recordData);
      console.log('✅ Airtable record created successfully');
      console.log('Record ID:', airtableRecord.getId());
      console.log('Record fields:', JSON.stringify(airtableRecord.fields, null, 2));
    } catch (airtableError) {
      console.error('❌ Airtable create error:', airtableError.message);
      console.error('Airtable error details:', airtableError);
      
      // Check if it's a field validation error
      if (airtableError.message.includes('INVALID_REQUEST_BODY')) {
        throw new Error(`Airtable field validation failed. Check field names and types. Details: ${airtableError.message}`);
      }
      
      throw new Error(`Failed to save to Airtable: ${airtableError.message}`);
    }

    // Send email if SendGrid is configured
    let emailSent = false;
    if (process.env.SENDGRID_API_KEY && formData.email) {
      console.log('=== EMAIL PROCESSING ===');
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const isLeadMagnet = ['lead-magnet', 'exit-intent', 'landing-popup'].includes(formData.formType);
        console.log('Is lead magnet:', isLeadMagnet);
        
        const emailData = {
          to: formData.email,
          from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
          },
          subject: isLeadMagnet 
            ? '🎁 Your Enterprise Revenue Forecasting Blueprint is Ready'
            : '✅ Application Received - Track Assignment in Progress',
          html: isLeadMagnet ? getBlueprintEmail(formData) : getApplicationEmail(formData),
          replyTo: 'tech@skillaipath.com'
        };

        console.log('Sending email to:', emailData.to);
        await sgMail.send(emailData);
        console.log('✅ Email sent successfully');
        emailSent = true;

        // Update Airtable record to mark email as sent
        try {
          await base('Leads').update(airtableRecord.getId(), { 
            'Email Sent': true,
            'Email Sent At': new Date().toISOString()
          });
          console.log('✅ Updated email sent status in Airtable');
        } catch (updateError) {
          console.error('⚠️ Failed to update email status:', updateError.message);
          // Don't fail the whole function for this
        }

      } catch (emailError) {
        console.error('❌ Email sending failed:', emailError.message);
        console.error('Email error details:', emailError);
        // Don't fail the whole function if email fails
      }
    } else {
      console.log('📧 SendGrid not configured or no email provided, skipping email');
    }

    // Success response
    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Form submitted successfully',
        data: {
          recordId: airtableRecord.getId(),
          formType: formData.formType,
          emailSent: emailSent,
          timestamp: timestamp
        },
        debug: {
          airtableRecordId: airtableRecord.getId(),
          emailAttempted: !!process.env.SENDGRID_API_KEY,
          emailSent: emailSent
        }
      })
    };

    console.log('=== SUCCESS RESPONSE ===');
    console.log('Response:', JSON.stringify(response, null, 2));
    return response;

  } catch (error) {
    console.error('=== SIMPLE FORM ERROR ===');
    console.error('Error in handleSimpleForm:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

// Handle complex qualification forms with scoring
async function handleQualificationForm(formData, base, headers) {
  try {
    console.log('=== QUALIFICATION FORM PROCESSING ===');
    
    // Validate required fields for qualification forms
    const requiredFields = ['first_name', 'last_name', 'email'];
    const missingFields = requiredFields.filter(field => !formData[field] || formData[field].trim() === '');
    
    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields: missingFields,
          redirectUrl: '/?error=missing_fields'
        })
      };
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid email format',
          field: 'email',
          redirectUrl: '/?error=invalid_email'
        })
      };
    }

    // Calculate priority score and tier
    console.log('=== SCORING CALCULATION ===');
    const score = calculateStudentPriority(formData);
    const tier = getStudentTier(score);
    console.log(`Calculated score: ${score}/100`);
    console.log(`Assigned tier: ${tier}`);
    
    // Prepare qualification record
    const timestamp = new Date().toISOString();
    const recordData = {
      'Email': formData.email.trim().toLowerCase(),
      'First Name': formData.first_name.trim(),
      'Last Name': formData.last_name.trim(),
      'Phone': formData.phone?.trim() || formData.whatsapp_number?.trim() || '',
      'Form Type': 'qualification',
      'Interest': formData.interest?.trim() || formData.most_interested_in?.trim() || '',
      'Status': formData.status?.trim() || formData.current_status?.trim() || '',
      'Challenge': formData.challenge?.trim() || formData.career_challenge?.trim() || '',
      'Privacy Consent': 'Yes',
      'Updates Consent': 'Yes',
      'Email Sent': false,
      'Lead Source': 'Qualification Form',
      'Priority Score': score,
      'Tier': tier,
      'Previous Courses': formData.previous_courses?.trim() || '',
      'Additional Context': formData.additional_context?.trim() || '',
      'Created At': timestamp,
      'Qualification Date': timestamp.split('T')[0], // Date only
      'User Agent': formData.userAgent || 'Unknown',
      'Referrer': formData.referrer || 'Direct'
    };

    console.log('Prepared qualification record:', JSON.stringify(recordData, null, 2));

    // Create Airtable record
    console.log('=== AIRTABLE CREATE (QUALIFICATION) ===');
    let airtableRecord;
    try {
      airtableRecord = await base('Leads').create(recordData);
      console.log('✅ Qualification record created successfully');
      console.log('Record ID:', airtableRecord.getId());
    } catch (airtableError) {
      console.error('❌ Airtable qualification create error:', airtableError.message);
      throw new Error(`Failed to save qualification to Airtable: ${airtableError.message}`);
    }

    // Send qualification email
    let emailSent = false;
    if (process.env.SENDGRID_API_KEY) {
      console.log('=== QUALIFICATION EMAIL ===');
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const emailData = {
          to: formData.email,
          from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
          },
          subject: `✅ Application Received - ${tier} Track Assignment`,
          html: getQualificationEmail(formData, score, tier),
          replyTo: 'tech@skillaipath.com'
        };

        await sgMail.send(emailData);
        console.log('✅ Qualification email sent successfully');
        emailSent = true;
        
        // Update Airtable record
        await base('Leads').update(airtableRecord.getId(), { 
          'Email Sent': true,
          'Email Sent At': new Date().toISOString()
        });

      } catch (emailError) {
        console.error('❌ Qualification email failed:', emailError.message);
        // Continue without failing
      }
    }

    // Send to external webhook if configured
    if (process.env.FORM_WEBHOOK_URL) {
      try {
        console.log('=== EXTERNAL WEBHOOK ===');
        const webhookData = {
          ...formData,
          priority_score: score,
          tier: tier,
          processed_at: timestamp,
          record_id: airtableRecord.getId(),
          ip_address: event.headers['x-forwarded-for'] || 'unknown',
          user_agent: event.headers['user-agent'] || 'unknown'
        };

        const webhookResponse = await fetch(process.env.FORM_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookData)
        });

        console.log('✅ Webhook sent, status:', webhookResponse.status);
      } catch (webhookError) {
        console.error('⚠️ Webhook failed:', webhookError.message);
        // Don't fail the main function
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
    console.log('Redirect URL:', redirectUrl);

    // Success response with redirect
    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tier: tier,
        score: score,
        redirectUrl: redirectUrl,
        message: 'Lead processed successfully',
        data: {
          recordId: airtableRecord.getId(),
          qualificationTier: tier,
          priorityScore: score,
          emailSent: emailSent,
          timestamp: timestamp
        },
        debug: {
          calculatedScore: score,
          assignedTier: tier,
          redirectUrl: redirectUrl,
          airtableRecordId: airtableRecord.getId()
        }
      })
    };

    console.log('=== QUALIFICATION SUCCESS ===');
    console.log('Final response:', JSON.stringify(response, null, 2));
    return response;

  } catch (error) {
    console.error('=== QUALIFICATION FORM ERROR ===');
    console.error('Error in handleQualificationForm:', error.message);
    console.error('Error stack:', error.stack);
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
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .cta-button { 
            background: #667eea; color: white; padding: 15px 30px; text-decoration: none; 
            border-radius: 5px; display: inline-block; margin: 20px 0; font-weight: bold;
        }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 0.9em; color: #666; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
        .highlight { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
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
            
            <p>Thank you for your interest in building real business solutions! As promised, here's your complete <strong>Enterprise Revenue Forecasting Blueprint</strong>.</p>
            
            <div class="highlight">
                <h3>📦 What's Included in Your Blueprint:</h3>
                <ul>
                    <li>✅ <strong>Complete Architecture Diagram</strong> - Full system design and data flow</li>
                    <li>✅ <strong>Python Code with Databricks</strong> - Production-ready implementation</li>
                    <li>✅ <strong>SQL Database Schema</strong> - Complete data pipeline structure</li>
                    <li>✅ <strong>Power BI Dashboard Templates</strong> - Professional reporting views</li>
                    <li>✅ <strong>Business Presentation Deck</strong> - Client-ready presentation</li>
                    <li>✅ <strong>Step-by-Step Implementation Guide</strong> - Detailed walkthrough</li>
                </ul>
            </div>
            
            <div style="text-align: center;">
                <a href="https://github.com/SkillAIPath/Production-Patterns" class="cta-button">📥 Download Complete Blueprint</a>
            </div>
            
            <div class="highlight">
                <h3>🚀 Next Steps:</h3>
                <ol>
                    <li><strong>Download</strong> the blueprint from the link above</li>
                    <li><strong>Review</strong> the architecture and code structure</li>
                    <li><strong>Try implementing</strong> the basic forecasting model</li>
                    <li><strong>Reply with questions</strong> - I personally answer every email</li>
                </ol>
            </div>
            
            <p><strong>Want to build more enterprise solutions like this?</strong></p>
            <p>I'm personally reviewing applications for custom track assignments. Students in our program build 4 real business solutions and get direct mentorship throughout their journey.</p>
            
            <p>Feel free to reply with any questions about the blueprint or our mentorship program!</p>
            
            <p>Best regards,<br>
            <strong>Viresh Gendle</strong><br>
            AI & Cloud Architect<br>
            Skill AI Path</p>
        </div>
        <div class="footer">
            <p>📞 +91 9301310154 | 📧 tech@skillaipath.com | 🌐 www.skillaipath.com</p>
            <p>Building real business solutions, not toy projects.</p>
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
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 0.9em; color: #666; }
        .highlight { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #4caf50; }
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
            
            <div class="highlight">
                <h3>What happens next:</h3>
                <ol>
                    <li><strong>Personal Review</strong> - I'll analyze your goals and background</li>
                    <li><strong>Custom Track Recommendation</strong> - Based on your specific needs</li>
                    <li><strong>Direct Contact</strong> - WhatsApp/Email within 72 hours</li>
                    <li><strong>Investment Discussion</strong> - Timeline and payment options</li>
                </ol>
            </div>
            
            <p><strong>While you wait:</strong></p>
            <ul>
                <li>📂 Check out our <a href="https://github.com/SkillAIPath/Production-Patterns">enterprise code examples</a></li>
                <li>📱 Join our <a href="https://chat.whatsapp.com/C5VDO1LekAf5ymTNTpSrJj">WhatsApp community</a> for updates</li>
                <li>💬 Feel free to reply with any immediate questions</li>
            </ul>
            
            <p>I'm excited to help you build real business solutions that matter in your career!</p>
            
            <p>Best regards,<br>
            <strong>Viresh Gendle</strong><br>
            AI & Cloud Architect<br>
            Skill AI Path</p>
        </div>
        <div class="footer">
            <p>📞 +91 9301310154 | 📧 tech@skillaipath.com | 🌐 www.skillaipath.com</p>
            <p>Building real business solutions, not toy projects.</p>
        </div>
    </div>
</body>
</html>`;
}

function getQualificationEmail(data, score, tier) {
  const name = data.first_name || 'there';
  
  const tierDescriptions = {
    'PRIORITY_QUALIFIED': {
      title: '🏆 Priority Track',
      description: 'You qualify for our premium track with personal mentoring',
      benefits: ['Personal 1-on-1 mentoring sessions', 'All 6 tracks unlocked', 'Priority job placement support', 'Founder\'s pricing (locked-in)']
    },
    'STANDARD_QUALIFIED': {
      title: '📊 Standard Track', 
      description: 'Perfect for structured learning with comprehensive guidance',
      benefits: ['Complete curriculum access', 'Weekly group mentoring', 'Portfolio development', 'Career guidance support']
    },
    'BASIC_QUALIFIED': {
      title: '🌟 Foundation Track',
      description: 'Great starting point with step-by-step guidance', 
      benefits: ['Foundation skill building', 'Community support', 'Project-based learning', 'Clear progression path']
    },
    'GENERAL': {
      title: '🎓 Workshop Access',
      description: 'Start with our free workshop to explore opportunities',
      benefits: ['Free career workshop access', 'Learning roadmap guidance', 'Community group access', 'Future program updates']
    }
  };

  const tierInfo = tierDescriptions[tier] || tierDescriptions['GENERAL'];
  
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .tier-badge { 
            background: #ffd700; color: #333; padding: 12px 24px; border-radius: 25px; 
            font-weight: bold; display: inline-block; margin: 15px 0; text-align: center;
        }
        .score-box { 
            background: #e3f2fd; border: 2px solid #2196f3; border-radius: 10px; 
            padding: 20px; text-align: center; margin: 20px 0;
        }
        .benefits { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 15px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 0.9em; color: #666; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
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
            
            <div class="score-box">
                <h3>Your Qualification Results</h3>
                <div class="tier-badge">${tierInfo.title}</div>
                <p><strong>Priority Score: ${score}/100</strong></p>
                <p>${tierInfo.description}</p>
            </div>
            
            <div class="benefits">
                <h3>✨ Your Track Benefits:</h3>
                <ul>
                    ${tierInfo.benefits.map(benefit => `<li>✅ ${benefit}</li>`).join('')}
                </ul>
            </div>
            
            <p><strong>📋 Your Application Details:</strong></p>
            <ul>
                <li><strong>Track Interest:</strong> ${data.most_interested_in || data.interest || 'Not specified'}</li>
                <li><strong>Current Status:</strong> ${data.current_status || data.status || 'Not specified'}</li>
                <li><strong>Qualification Level:</strong> ${tier}</li>
            </ul>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3>🚀 Next Steps:</h3>
                <ol>
                    <li><strong>Personal Contact</strong> - I'll reach you within 24-48 hours</li>
                    <li><strong>Custom Learning Path</strong> - Tailored to your specific goals</li>
                    <li><strong>Investment Discussion</strong> - Flexible timeline and payment options</li>
                    <li><strong>Direct Mentorship</strong> - WhatsApp/Phone consultation included</li>
                </ol>
            </div>
            
            <p>I'm excited to help you build real business solutions and accelerate your career in AI & Data!</p>
            
            <p>Best regards,<br>
            <strong>Viresh Gendle</strong><br>
            AI & Cloud Architect<br>
            Skill AI Path</p>
        </div>
        <div class="footer">
            <p>📞 +91 9301310154 | 📧 tech@skillaipath.com | 🌐 www.skillaipath.com</p>
            <p>Building real business solutions, not toy projects.</p>
        </div>
    </div>
</body>
</html>`;
}

// LEAD SCORING ALGORITHM
function calculateStudentPriority(formData) {
  let score = 0;
  
  console.log('=== SCORING BREAKDOWN ===');
  
  // 1. CURRENT STATUS (40 points max) - Most Important Factor
  const statusScores = {
    'College Student': 40,
    'Recent Graduate (0-2 years)': 35,
    'Looking for Career Change': 25,
    'Current Freelancer': 20,
    'Working Professional (2-5 years)': 15,
    'Senior Professional (5+ years)': 10
  };
  
  const status = formData.current_status || formData.status || '';
  const statusScore = statusScores[status] || 0;
  score += statusScore;
  console.log(`Status (${status}): +${statusScore} points`);
  
  // 2. PRIMARY INTEREST (30 points max) - Learning Motivation
  const interestScores = {
    'Complete Stack (All 6 Tracks)': 30,
    'Data Analytics Track': 25,
    'Data Engineering Track': 25,
    'MLOps Track': 20,
    'Career Transformation': 15,
    'Freelancing Program': 10,
    'Not Sure / Need Guidance': 5
  };
  
  const interest = formData.most_interested_in || formData.interest || '';
  const interestScore = interestScores[interest] || 0;
  score += interestScore;
  console.log(`Interest (${interest}): +${interestScore} points`);
  
  // 3. PREVIOUS LEARNING EXPERIENCE (20 points max) - Commitment Level
  const courseScores = {
    'Paid courses (didn\'t complete)': 20,
    'Completed other courses': 18,
    'Attended bootcamp/program': 15,
    'Only free courses': 10,
    'No, this is my first': 8
  };
  
  const previousCourses = formData.previous_courses || '';
  const courseScore = courseScores[previousCourses] || 0;
  score += courseScore;
  console.log(`Previous courses (${previousCourses}): +${courseScore} points`);
  
  // 4. CAREER CHALLENGE TEXT ANALYSIS (25 points max) - Detailed Assessment
  const challenge = (formData.career_challenge || formData.challenge || '').toLowerCase();
  let challengeScore = 0;
  
  // Length quality assessment
  if (challenge.length > 200) {
    challengeScore += 15;
    console.log('Challenge length (>200 chars): +15 points');
  } else if (challenge.length > 100) {
    challengeScore += 12;
    console.log('Challenge length (>100 chars): +12 points');
  } else if (challenge.length > 50) {
    challengeScore += 8;
    console.log('Challenge length (>50 chars): +8 points');
  } else if (challenge.length > 20) {
    challengeScore += 4;
    console.log('Challenge length (>20 chars): +4 points');
  }
  
  // Student-specific keywords (higher priority)
  const studentKeywords = ['placement', 'campus', 'internship', 'fresher', 'graduate', 'college', 'university', 'student', 'final year', 'job ready'];
  let studentKeywordCount = 0;
  studentKeywords.forEach(keyword => {
    if (challenge.includes(keyword)) {
      studentKeywordCount++;
      challengeScore += 3;
    }
  });
  if (studentKeywordCount > 0) {
    console.log(`Student keywords (${studentKeywordCount}): +${studentKeywordCount * 3} points`);
  }
  
  // Urgency and motivation indicators
  const urgencyKeywords = ['urgent', 'asap', 'soon', 'immediate', 'deadline', 'interview', 'opportunity', 'confused', 'lost', 'direction', 'help', 'stuck'];
  let urgencyKeywordCount = 0;
  urgencyKeywords.forEach(keyword => {
    if (challenge.includes(keyword)) {
      urgencyKeywordCount++;
      challengeScore += 2;
    }
  });
  if (urgencyKeywordCount > 0) {
    console.log(`Urgency keywords (${urgencyKeywordCount}): +${urgencyKeywordCount * 2} points`);
  }
  
  score += challengeScore;
  console.log(`Total challenge analysis: +${challengeScore} points`);
  
  // 5. EMAIL DOMAIN ANALYSIS (15 points max) - Institution Quality
  const email = (formData.email || '').toLowerCase();
  let emailScore = 0;
  
  if (email.includes('.edu') || email.includes('.ac.in')) {
    emailScore += 15;
    console.log('Educational email domain: +15 points');
  } else if (/iit|nit|bits|iisc|iiith|iim|xlri/.test(email)) {
    emailScore += 12;
    console.log('Premier institute email: +12 points');
  } else if (email.includes('gmail') || email.includes('yahoo') || email.includes('hotmail')) {
    emailScore += 2;
    console.log('Personal email: +2 points');
  } else {
    emailScore += 4;
    console.log('Professional/other email: +4 points');
  }
  
  score += emailScore;
  
  // 6. ADDITIONAL CONTEXT BONUS (10 points max) - Extra Motivation
  const additional = (formData.additional_context || '').toLowerCase();
  let additionalScore = 0;
  
  if (additional.length > 50) {
    additionalScore += 5;
    console.log('Additional context provided: +5 points');
  }
  
  if (/serious|committed|dedicated|focused|determined|passionate/.test(additional)) {
    additionalScore += 5;
    console.log('Commitment keywords in additional context: +5 points');
  }
  
  score += additionalScore;
  
  // Cap at 100 and ensure minimum 0
  const finalScore = Math.max(0, Math.min(score, 100));
  console.log(`Final score: ${finalScore}/100`);
  
  return finalScore;
}

// Tier Assignment Based on Score
function getStudentTier(score) {
  if (score >= 85) return 'PRIORITY_QUALIFIED';     // Top 15% - Premium mentoring
  if (score >= 65) return 'STANDARD_QUALIFIED';     // Good fit - Structured program  
  if (score >= 45) return 'BASIC_QUALIFIED';        // Foundation level - Guided learning
  return 'GENERAL';                                  // Workshop and community access
}