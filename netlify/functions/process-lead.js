// netlify/functions/process-lead.js
// SIMPLE WORKING VERSION - Basic form submission + email

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
    console.log('📝 Form received:', formData.email, formData.formType || 'contact');

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

    // Create simple record with your Airtable fields
    const recordData = {
      'Email': formData.email,
      'First Name': formData.first_name || formData.name || '',
      'Last Name': formData.last_name || '',
      'Phone': formData.phone || '',
      'Interest': formData.interest || '',
      'Status': formData.status || '',
      'Challenge': formData.challenge || '',
      'Form Type': formData.formType || 'contact',
      'Email Sent': false
    };

    // Add consent fields if present
    if (formData.privacy !== undefined) {
      recordData['Privacy Consent'] = formData.privacy ? 'Yes' : 'No';
    }
    if (formData.updates !== undefined) {
      recordData['Updates Consent'] = formData.updates ? 'Yes' : 'No';
    }

    console.log('💾 Saving to Airtable...');
    
    // Save to Airtable
    const airtableRecord = await base('Leads').create(recordData);
    console.log('✅ Airtable record created:', airtableRecord.id);

    // Send simple email
    console.log('📧 Sending email...');
    
    const emailData = {
      to: formData.email,
      from: {
        email: 'tech@skillaipath.com',
        name: 'Viresh - Skill AI Path'
      },
      subject: '✅ Application Received - Skill AI Path',
      html: `
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
                    <h1>✅ Application Received!</h1>
                    <p>We'll review and contact you soon</p>
                </div>
                <div class="content">
                    <p>Hi ${formData.first_name || formData.name || 'there'},</p>
                    
                    <p>Thank you for your application to Skill AI Path! We've received your submission and will review it personally.</p>
                    
                    <p><strong>What happens next:</strong></p>
                    <ol>
                        <li>Personal review of your application</li>
                        <li>Custom track recommendation</li>
                        <li>Contact via WhatsApp/Email within 72 hours</li>
                        <li>Discussion of next steps</li>
                    </ol>
                    
                    <p><strong>Your Details:</strong></p>
                    <ul>
                        <li><strong>Email:</strong> ${formData.email}</li>
                        <li><strong>Name:</strong> ${formData.first_name || formData.name || ''} ${formData.last_name || ''}</li>
                        ${formData.interest ? `<li><strong>Interest:</strong> ${formData.interest}</li>` : ''}
                        ${formData.status ? `<li><strong>Status:</strong> ${formData.status}</li>` : ''}
                    </ul>
                    
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
        </html>
      `
    };

    await sgMail.send(emailData);
    console.log('✅ Email sent to:', formData.email);

    // Update Airtable to mark email as sent
    await base('Leads').update(airtableRecord.id, { 'Email Sent': true });
    console.log('✅ Email status updated in Airtable');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Application submitted successfully! We will review and contact you via WhatsApp/Email within 72 hours with your custom track options.',
        recordId: airtableRecord.id
      })
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
