// netlify/functions/process-lead.js
// FIXED VERSION - matches your Airtable fields exactly

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

    // Create record with ONLY the fields that exist in your Airtable
    const recordData = {
      Email: formData.email,
      'First Name': formData.first_name || formData.name || '',
      'Form Type': formData.formType || 'contact',
      'Email Sent': false,
      'Created Date': new Date().toISOString()
    };

    // Save to Airtable
    const airtableRecord = await base('Leads').create(recordData);

    // Determine email type and content
    const isLeadMagnet = ['lead-magnet', 'exit-intent', 'landing-popup'].includes(formData.formType);
    
    // Send email
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
