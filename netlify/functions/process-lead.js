// netlify/functions/process-lead.js
// MAXIMUM WORKING VERSION - All features that actually work

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
    console.log('📝 Processing form:', formData.email, formData.formType || 'standard');

    // Validate environment variables
    if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database service not configured' })
      };
    }

    if (!process.env.SENDGRID_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Email service not configured' })
      };
    }

    // Initialize services
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_TOKEN 
    }).base(process.env.AIRTABLE_BASE_ID);

    // Determine form type and email template
    const isLeadMagnet = formData.formType && ['lead-magnet', 'exit-intent', 'landing-popup'].includes(formData.formType);
    const isPopup = formData.formType === 'popup';

    // Calculate simple priority score
    let priorityScore = 0;
    
    // Basic scoring
    if (formData.status === 'College Student') priorityScore += 40;
    else if (formData.status === 'Recent Graduate') priorityScore += 35;
    else if (formData.status === 'Looking for Career Change') priorityScore += 25;
    else priorityScore += 15;
    
    if (formData.interest === 'Build analytics solutions') priorityScore += 30;
    else if (formData.interest === 'Create automation systems') priorityScore += 25;
    else priorityScore += 15;
    
    if (formData.challenge && formData.challenge.length > 100) priorityScore += 20;
    else if (formData.challenge && formData.challenge.length > 50) priorityScore += 10;
    
    if (formData.email.includes('.edu')) priorityScore += 10;
    else if (formData.email.includes('gmail')) priorityScore += 5;

    // Determine tier
    let tier = 'GENERAL';
    if (priorityScore >= 80) tier = 'PRIORITY';
    else if (priorityScore >= 60) tier = 'STANDARD';
    else if (priorityScore >= 40) tier = 'BASIC';

    console.log('📊 Priority Score:', priorityScore, 'Tier:', tier);

    // Create Airtable record with only confirmed fields
    const recordData = {
      'Email': formData.email,
      'First Name': formData.first_name || formData.name || '',
      'Last Name': formData.last_name || '',
      'Phone': formData.phone || '',
      'Interest': formData.interest || '',
      'Status': formData.status || '',
      'Challenge': formData.challenge || '',
      'Email Sent': false
    };

    // Only add fields that definitely exist in Airtable
    // Skip consent fields to avoid field errors

    console.log('💾 Saving to Airtable...');
    
    // Save to Airtable
    const airtableRecord = await base('Leads').create(recordData);
    console.log('✅ Airtable record created:', airtableRecord.id);

    // Send appropriate email based on form type
    console.log('📧 Sending email type:', isLeadMagnet ? 'Blueprint' : isPopup ? 'Quick Response' : 'Full Application');
    
    let emailTemplate;
    let emailSubject;

    if (isLeadMagnet) {
      emailSubject = '🎁 Your Enterprise Revenue Forecasting Blueprint is Ready';
      emailTemplate = getBlueprintEmail(formData);
    } else if (isPopup) {
      emailSubject = '⚡ Quick Response - Skill AI Path';
      emailTemplate = getQuickResponseEmail(formData);
    } else {
      emailSubject = `✅ Application Received - ${tier} Track Assignment`;
      emailTemplate = getFullApplicationEmail(formData, priorityScore, tier);
    }

    const emailData = {
      to: formData.email,
      from: {
        email: 'tech@skillaipath.com',
        name: 'Viresh - Skill AI Path'
      },
      subject: emailSubject,
      html: emailTemplate
    };

    await sgMail.send(emailData);
    console.log('✅ Email sent to:', formData.email);

    // Update Airtable to mark email as sent
    await base('Leads').update(airtableRecord.id, { 'Email Sent': true });
    console.log('✅ Email status updated');

    // Determine success message and potential redirect
    let successMessage = 'Application submitted successfully! We will review and contact you via WhatsApp/Email within 72 hours with your custom track options.';
    let redirectUrl = null;

    if (tier === 'PRIORITY') {
      successMessage = 'Priority application received! We\'ll contact you within 24 hours with exclusive track options.';
      redirectUrl = '/booking-pages/priority-qualified.html';
    } else if (tier === 'STANDARD') {
      successMessage = 'Application received! We\'ll contact you within 48 hours with personalized track recommendations.';
      redirectUrl = '/booking-pages/standard-qualified.html';
    } else if (tier === 'BASIC') {
      successMessage = 'Application received! We\'ll contact you within 72 hours with suitable learning options.';
      redirectUrl = '/booking-pages/basic-qualified.html';
    }

    const response = {
      success: true,
      message: successMessage,
      recordId: airtableRecord.id,
      tier: tier,
      score: priorityScore
    };

    if (redirectUrl) {
      response.redirectUrl = redirectUrl;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

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

function getQuickResponseEmail(data) {
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ Quick Response!</h1>
            <p>We Got Your Message</p>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            
            <p>Thanks for reaching out to Skill AI Path! Your message has been received and I'll personally review it.</p>
            
            <p><strong>What happens next:</strong></p>
            <ul>
                <li>Personal review within 24 hours</li>
                <li>Custom recommendations based on your needs</li>
                <li>Direct contact via WhatsApp/Email</li>
            </ul>
            
            <p>If you have any urgent questions, feel free to reach out directly.</p>
            
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

function getFullApplicationEmail(data, score, tier) {
  const name = data.first_name || data.name || 'there';
  
  let tierMessage = '';
  let nextSteps = '';
  
  if (tier === 'PRIORITY') {
    tierMessage = 'Congratulations! Your application qualifies for our Priority Track with exclusive benefits.';
    nextSteps = 'I\'ll contact you within 24 hours with priority track options and special offers.';
  } else if (tier === 'STANDARD') {
    tierMessage = 'Your application shows strong potential for our Standard Track programs.';
    nextSteps = 'I\'ll contact you within 48 hours with personalized track recommendations.';
  } else if (tier === 'BASIC') {
    tierMessage = 'Your application has been received for our supportive Basic Track programs.';
    nextSteps = 'I\'ll contact you within 72 hours with suitable learning options.';
  } else {
    tierMessage = 'Your application has been received and will be reviewed personally.';
    nextSteps = 'I\'ll contact you within 72 hours to discuss the best learning path for your goals.';
  }
  
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
            <p>Your Track Assignment is Ready</p>
        </div>
        <div class="content">
            <p>Hi ${name},</p>
            
            <p>Thank you for your detailed application to Skill AI Path! I've personally reviewed your background and goals.</p>
            
            <div class="tier-badge">${tier} TRACK - Priority Score: ${score}/100</div>
            
            <p><strong>${tierMessage}</strong></p>
            
            <p><strong>Your Application Summary:</strong></p>
            <ul>
                <li><strong>Email:</strong> ${data.email}</li>
                <li><strong>Name:</strong> ${data.first_name || ''} ${data.last_name || ''}</li>
                ${data.interest ? `<li><strong>Interest:</strong> ${data.interest}</li>` : ''}
                ${data.status ? `<li><strong>Status:</strong> ${data.status}</li>` : ''}
            </ul>
            
            <p><strong>Next Steps:</strong></p>
            <p>${nextSteps}</p>
            
            <p><strong>What You Get:</strong></p>
            <ul>
                <li>✅ Personal mentorship and guidance</li>
                <li>✅ Real business problem-solving projects</li>
                <li>✅ Enterprise-grade tools and technologies</li>
                <li>✅ Direct career placement support</li>
            </ul>
            
            <p><strong>While you wait:</strong> Check out our enterprise code examples at <a href="https://github.com/SkillAIPath/Production-Patterns">GitHub</a></p>
            
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
