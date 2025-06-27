// netlify/functions/submit-form.js
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

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const data = JSON.parse(event.body);
    console.log('Received data:', data);

    // Initialize SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Initialize Airtable with Personal Access Token
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_TOKEN // Using the new token instead of API key
    }).base(process.env.AIRTABLE_BASE_ID);

    // Save to Airtable Leads table
    const airtableRecord = await base('Leads').create({
      Email: data.email,
      'First Name': data.first_name || data.name || '',
      'Last Name': data.last_name || '',
      Phone: data.phone || '',
      'Form Type': data.formType,
      Interest: data.interest || '',
      Status: data.status || '',
      Challenge: data.challenge || '',
      'Privacy Consent': data.privacy ? 'Yes' : 'No',
      'Updates Consent': data.updates ? 'Yes' : 'No',
      'Email Sent': false
    });

    console.log('Saved to Airtable:', airtableRecord.id);

    // Determine email type
    const isLeadMagnet = ['lead-magnet', 'exit-intent', 'landing-popup'].includes(data.formType);
    
    // Send email
    const emailData = {
      to: data.email,
      from: {
        email: 'tech@skillaipath.com',
        name: 'Viresh - Skill AI Path'
      },
      subject: isLeadMagnet 
        ? '🎁 Your Enterprise Revenue Forecasting Blueprint is Ready'
        : '✅ Application Received - Track Assignment in Progress',
      html: isLeadMagnet ? getBlueprintEmail(data) : getApplicationEmail(data)
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
        recordId: airtableRecord.id
      })
    };

  } catch (error) {
    console.error('Error:', error);
    
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
