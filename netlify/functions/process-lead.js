// netlify/functions/process-lead.js - DIAGNOSTIC VERSION
const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

// Initialize SendGrid with detailed logging
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid initialized with key:', process.env.SENDGRID_API_KEY?.substring(0, 10) + '...');
} else {
    console.log('❌ SENDGRID_API_KEY missing completely');
}

// Initialize Airtable
let base;
if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    console.log('✅ Airtable initialized');
} else {
    console.log('❌ Airtable credentials missing');
}

exports.handler = async (event, context) => {
    console.log('🚀 Function started');
    
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: 'OK' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const formData = JSON.parse(event.body);
        
        console.log('📝 Form submission details:', {
            formType: formData.formType,
            email: formData.email,
            hasName: !!formData.name || !!formData.first_name,
            allKeys: Object.keys(formData)
        });
        
        const urgencyData = calculateUrgencyData();
        
        if (formData.formType === 'urgency-check') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    urgencyData: urgencyData,
                    message: 'Urgency data retrieved'
                })
            };
        }
        
        if (!formData.email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Email is required',
                    message: 'Please provide a valid email address'
                })
            };
        }
        
        const isLeadMagnet = ['lead-magnet', 'landing-popup', 'exit-intent'].includes(formData.formType);
        console.log('📧 Email type determined:', { isLeadMagnet, formType: formData.formType });
        
        let response = {
            success: true,
            urgencyData: urgencyData,
            debugInfo: {
                hasApiKey: !!process.env.SENDGRID_API_KEY,
                apiKeyLength: process.env.SENDGRID_API_KEY?.length || 0,
                formType: formData.formType,
                isLeadMagnet: isLeadMagnet
            }
        };

        // Email handling with extensive logging
        try {
            if (isLeadMagnet) {
                console.log('📧 PROCESSING LEAD MAGNET EMAIL...');
                await sendBlueprintEmail(formData);
                response.message = 'Success! Check your email for the Enterprise Revenue Forecasting Blueprint download link.';
                response.emailSent = true;
                response.emailType = 'blueprint';
                console.log('✅ Lead magnet email completed successfully');
            } else {
                console.log('📧 PROCESSING APPLICATION FORM...');
                console.log('📧 About to call handleApplication...');
                const applicationResult = await handleApplication(formData);
                console.log('📧 handleApplication returned:', applicationResult);
                response = { ...response, ...applicationResult };
                response.emailSent = true;
                response.emailType = 'admin_notification';
                console.log('✅ Application form completed successfully');
            }
        } catch (emailError) {
            console.error('❌ EMAIL COMPLETELY FAILED:', emailError);
            console.error('❌ Error name:', emailError.name);
            console.error('❌ Error message:', emailError.message);
            console.error('❌ Error stack:', emailError.stack);
            
            response.emailWarning = 'Form submitted but email failed';
            response.emailSent = false;
            response.emailError = emailError.message;
            response.errorDetails = {
                name: emailError.name,
                message: emailError.message,
                hasApiKey: !!process.env.SENDGRID_API_KEY
            };
        }

        // Save to Airtable
        try {
            if (formData.formType !== 'urgency-check') {
                await saveToAirtable(formData, response);
            }
        } catch (airtableError) {
            console.error('❌ Airtable failed:', airtableError);
            response.airtableWarning = 'Data saved locally but sync delayed';
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('💥 FUNCTION COMPLETELY FAILED:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: 'Something went wrong. Please try again or contact us at tech@skillaipath.com',
                details: error.message 
            })
        };
    }
};

async function sendBlueprintEmail(formData) {
    console.log('📧 sendBlueprintEmail called for:', formData.email);
    
    if (!process.env.SENDGRID_API_KEY) {
        throw new Error('SendGrid API key not configured');
    }
    
    const customerName = formData.name || formData.first_name || 'Future Enterprise Builder';
    console.log('📧 Customer name determined:', customerName);
    
    const msg = {
        to: formData.email,
        from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
        },
        subject: '🎯 Your Enterprise Revenue Forecasting Blueprint is Ready!',
        html: `<p>Hi ${customerName},</p><p>Your blueprint is ready!</p><p>Download: <a href="https://drive.google.com/drive/folders/11l4e00K4qhioY2p_1BDzco49r6BjSbO4">Click Here</a></p>`
    };
    
    console.log('📧 About to send blueprint email via SendGrid...');
    const result = await sgMail.send(msg);
    console.log('✅ Blueprint email sent. SendGrid response:', result[0]?.statusCode);
    return result;
}

async function handleApplication(formData) {
    console.log('📧 handleApplication started');
    
    const score = calculatePriorityScore(formData);
    const tier = getPriorityTier(score);
    
    console.log('📊 Application scored:', { score, tier });
    
    // Check SendGrid availability
    if (!process.env.SENDGRID_API_KEY) {
        console.error('❌ SendGrid API key missing - cannot send admin notification');
        throw new Error('SendGrid not configured - cannot send admin notification');
    }
    
    console.log('📧 SendGrid available - proceeding with admin notification');
    console.log('📧 About to call sendAdminNotification...');
    
    try {
        const adminResult = await sendAdminNotification(formData, score, tier);
        console.log('✅ sendAdminNotification completed successfully:', adminResult?.[0]?.statusCode);
    } catch (adminError) {
        console.error('❌ sendAdminNotification failed:', adminError);
        throw adminError; // Re-throw to be caught by parent
    }
    
    return {
        score: score,
        tier: tier,
        message: `Application submitted successfully! Priority Level: ${tier} (Score: ${score}/100)`
    };
}

async function sendAdminNotification(formData, score, tier) {
    console.log('📧 sendAdminNotification called');
    
    const fullName = formData.first_name && formData.last_name 
        ? `${formData.first_name} ${formData.last_name}`
        : formData.name || 'No name provided';
    
    console.log('📧 Preparing admin email for:', fullName);
        
    const msg = {
        to: 'tech@skillaipath.com',
        from: {
            email: 'tech@skillaipath.com',
            name: 'Skill AI Path Application System'
        },
        subject: `🎯 New ${tier} Priority Application - ${fullName}`,
        html: `
            <h2>🎯 New ${tier} Priority Application</h2>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
            <p><strong>Interest:</strong> ${formData.interest || 'Not specified'}</p>
            <p><strong>Status:</strong> ${formData.status || 'Not specified'}</p>
            <p><strong>Score:</strong> ${score}/100 (${tier})</p>
            <p><strong>Challenge:</strong> ${formData.challenge || 'Not provided'}</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN')}</p>
        `
    };

    console.log('📧 About to send admin email to tech@skillaipath.com via SendGrid...');
    const result = await sgMail.send(msg);
    console.log('✅ Admin email sent. SendGrid response:', result[0]?.statusCode);
    return result;
}

// Rest of the functions remain the same...
async function saveToAirtable(formData, responseData) {
    if (!base) return null;
    
    const recordData = {};
    if (formData.name) recordData['Name'] = formData.name;
    if (formData.first_name) recordData['First Name'] = formData.first_name;
    if (formData.email) recordData['Email'] = formData.email;
    if (formData.phone) recordData['Phone'] = formData.phone;
    if (formData.interest) recordData['Interest'] = formData.interest;
    if (formData.status) recordData['Status'] = formData.status;
    if (formData.challenge) recordData['Challenge'] = formData.challenge;
    recordData['Form Type'] = formData.formType || 'unknown';
    if (formData.updates !== undefined) {
        recordData['Marketing Consent'] = formData.updates ? 'Yes' : 'No';
    }
    if (responseData.tier) {
        recordData['Lead Tier'] = responseData.tier;
    }
    recordData['Email Sent'] = responseData.emailSent ? 'Yes' : 'Failed';

    try {
        const record = await base('Table 1').create(recordData);
        console.log('✅ Airtable saved:', record.id);
        return record;
    } catch (error) {
        console.error('❌ Airtable error:', error);
        return null;
    }
}

function calculateUrgencyData() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    let slotsRemaining = 15;
    let totalSlots = 30;
    let isActive = true;
    let statusMessage = 'Active review period';
    
    if (currentDay === 1 || currentDay === 2) {
        slotsRemaining = 0;
        isActive = false;
        statusMessage = 'Review cycle closed - reopens Wednesday';
    }
    
    const slotsFilled = totalSlots - slotsRemaining;
    const progressPercentage = isActive ? Math.round((slotsFilled / totalSlots) * 100) : 0;
    
    return {
        slotsRemaining,
        slotsFilled,
        totalSlots,
        isActive,
        statusMessage,
        progressPercentage,
        timeRemaining: 24 * 60 * 60 * 1000,
        currentDay
    };
}

function calculatePriorityScore(formData) {
    let score = 50;
    
    const statusScores = {
        'Professional': 25,
        'Career Change': 20,
        'Entrepreneur': 20,
        'Graduate': 15,
        'Student': 10
    };
    score += statusScores[formData.status] || 0;
    
    const interestScores = {
        'Data Analytics': 15,
        'Automation': 15,
        'Freelancing Pro': 10,
        'Career Mastery': 10,
        'Need Guidance': 5
    };
    score += interestScores[formData.interest] || 0;
    
    if (formData.challenge && formData.challenge.length > 100) {
        score += 10;
    }
    
    return Math.min(100, score);
}

function getPriorityTier(score) {
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    return 'STANDARD';
}

function getFormSource(formType) {
    const sources = {
        'lead-magnet': 'Lead Magnet - Main Section',
        'landing-popup': 'Landing Popup - Timed',
        'exit-intent': 'Exit Intent Popup',
        'contact': 'Contact Form - Main',
        'popup': 'Application Popup'
    };
    return sources[formType] || 'Unknown Source';
}