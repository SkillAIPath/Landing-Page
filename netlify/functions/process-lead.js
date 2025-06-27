// netlify/functions/process-lead.js
// MINIMAL VERSION - Test with only basic fields

const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

exports.handler = async (event, context) => {
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
    
    console.log('=== DEBUG INFO ===');
    console.log('Form data received:', formData);
    console.log('Environment check:');
    console.log('- AIRTABLE_TOKEN exists:', !!process.env.AIRTABLE_TOKEN);
    console.log('- AIRTABLE_TOKEN starts with:', process.env.AIRTABLE_TOKEN?.substring(0, 10));
    console.log('- AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID);
    console.log('- SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);

    // Validate environment variables
    if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Missing Airtable credentials',
          hasToken: !!process.env.AIRTABLE_TOKEN,
          hasBaseId: !!process.env.AIRTABLE_BASE_ID
        })
      };
    }

    // Initialize Airtable
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_TOKEN 
    }).base(process.env.AIRTABLE_BASE_ID);

    // Create record with ONLY the most basic fields
    const recordData = {
      'Email': formData.email || 'test@example.com',
      'First Name': formData.first_name || 'Test'
    };

    console.log('Attempting to create record:', recordData);
    console.log('Table name: "Leads"');

    // Try to create record
    const airtableRecord = await base('Leads').create(recordData);
    console.log('✅ Record created successfully:', airtableRecord.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Minimal test successful!',
        recordId: airtableRecord.id
      })
    };

  } catch (error) {
    console.error('❌ Error details:');
    console.error('- Error type:', error.constructor.name);
    console.error('- Error message:', error.message);
    console.error('- Full error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Processing failed',
        details: error.message,
        type: error.constructor.name
      })
    };
  }
};
