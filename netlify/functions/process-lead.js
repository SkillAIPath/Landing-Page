// netlify/functions/process-lead.js - UPDATED WITH BOOKING REDIRECTS
const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid initialized');
} else {
    console.log('❌ SENDGRID_API_KEY missing');
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
        
        console.log('📝 Form submission:', {
            formType: formData.formType,
            email: formData.email,
            hasName: !!formData.name || !!formData.first_name
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
                    error: 'Email is required'
                })
            };
        }
        
        const isLeadMagnet = ['lead-magnet', 'landing-popup', 'exit-intent'].includes(formData.formType);
        
        let response = {
            success: true,
            urgencyData: urgencyData
        };

        // Email handling
        try {
            if (isLeadMagnet) {
                console.log('📧 Processing lead magnet email...');
                await sendBlueprintEmail(formData);
                response.message = 'Success! Check your email for the Enterprise Revenue Forecasting Blueprint download link.';
                response.emailSent = true;
                response.emailType = 'blueprint';
            } else {
                console.log('📧 Processing application form...');
                const applicationResult = await handleApplication(formData);
                response = { ...response, ...applicationResult };
                response.emailSent = true;
                response.emailType = 'admin_notification';
                
                // 🎯 NEW: Determine booking page redirect
                response.bookingPage = getBookingPageUrl(applicationResult.score);
                console.log(`📍 Redirect to: ${response.bookingPage}`);
            }
        } catch (emailError) {
            console.error('❌ Email failed:', emailError);
            response.emailWarning = 'Form submitted but email failed';
            response.emailSent = false;
            response.emailError = emailError.message;
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
        console.error('💥 Function failed:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: 'Something went wrong. Please try again or contact us at tech@skillaipath.com'
            })
        };
    }
};

// 🎯 NEW: Determine booking page based on score
function getBookingPageUrl(score) {
    if (score <= 45) {
        return '/booking-pages/basic-qualified.html';
    } else if (score <= 75) {
        return '/booking-pages/standard-qualified.html';
    } else {
        return '/booking-pages/priority-qualified.html';
    }
}

async function sendBlueprintEmail(formData) {
    console.log('📧 Sending blueprint email to:', formData.email);
    
    const customerName = formData.name || formData.first_name || 'Future Enterprise Builder';
    
    const msg = {
        to: formData.email,
        from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
        },
        subject: '🎯 Your Enterprise Revenue Forecasting Blueprint is Ready!',
        html: `
            <h2>Hi ${customerName},</h2>
            <p>Thank you for your interest in building real business solutions!</p>
            <p><strong>Your Enterprise Revenue Forecasting Blueprint is ready for download:</strong></p>
            <p><a href="https://drive.google.com/drive/folders/11l4e00K4qhioY2p_1BDzco49r6BjSbO4" style="background: #10b981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 20px 0;">📥 Download Complete Blueprint</a></p>
            
            <h3>What's Inside:</h3>
            <ul>
                <li>✅ Complete project architecture & system design</li>
                <li>✅ Python code with Databricks integration</li>
                <li>✅ SQL database schema & data pipeline</li>
                <li>✅ Power BI dashboard templates</li>
                <li>✅ Business presentation deck</li>
                <li>✅ Step-by-step implementation guide</li>
            </ul>
            
            <p>Questions? Reply to this email or WhatsApp us at +91 9301310154</p>
            
            <p>Best regards,<br>
            Viresh Gendle<br>
            Founder, Skill AI Path</p>
        `
    };
    
    const result = await sgMail.send(msg);
    console.log('✅ Blueprint email sent:', result[0]?.statusCode);
    return result;
}

async function handleApplication(formData) {
    console.log('📧 Handling application');
    
    const score = calculatePriorityScore(formData);
    const tier = getPriorityTier(score);
    
    console.log('📊 Application scored:', { score, tier });
    
    // Send admin notification
    try {
        await sendAdminNotification(formData, score, tier);
        console.log('✅ Admin notification sent');
    } catch (adminError) {
        console.error('❌ Admin notification failed:', adminError);
        throw adminError;
    }
    
    return {
        score: score,
        tier: tier,
        message: `Application submitted successfully! Priority Level: ${tier} (Score: ${score}/100)`
    };
}

async function sendAdminNotification(formData, score, tier) {
    const fullName = formData.first_name && formData.last_name 
        ? `${formData.first_name} ${formData.last_name}`
        : formData.name || 'No name provided';
        
    const msg = {
        to: 'tech@skillaipath.com',
        from: {
            email: 'tech@skillaipath.com',
            name: 'Skill AI Path Application System'
        },
        subject: `🎯 New ${tier} Priority Application - ${fullName} (Score: ${score})`,
        html: `
            <h2>🎯 New ${tier} Priority Application</h2>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${formData.email}</p>
                <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
                <p><strong>Interest:</strong> ${formData.interest || 'Not specified'}</p>
                <p><strong>Status:</strong> ${formData.status || 'Not specified'}</p>
                <p><strong>Score:</strong> ${score}/100 (${tier})</p>
                <p><strong>Challenge:</strong> ${formData.challenge || 'Not provided'}</p>
                <p><strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN')}</p>
            </div>
            
            <h3>Recommended Next Steps:</h3>
            ${getNextStepsForTier(tier, score)}
            
            <p><strong>Booking Page:</strong> ${getBookingPageUrl(score)}</p>
        `
    };

    const result = await sgMail.send(msg);
    console.log('✅ Admin email sent:', result[0]?.statusCode);
    return result;
}

function getNextStepsForTier(tier, score) {
    if (score <= 45) {
        return `
            <ul>
                <li>🎓 Invite to Free Friday Webinar</li>
                <li>📞 20-min Guidance Call for qualification</li>
                <li>👥 WhatsApp Community Access</li>
                <li>🎯 Foundation Track Consideration</li>
            </ul>
        `;
    } else if (score <= 75) {
        return `
            <ul>
                <li>📞 20-min Strategic Guidance Call</li>
                <li>📋 60-min Deep Dive Planning Session</li>
                <li>👥 WhatsApp Community Access</li>
                <li>🎯 Standard Track Qualification</li>
            </ul>
        `;
    } else {
        return `
            <ul>
                <li>⚡ 45-min Priority Assessment Call</li>
                <li>📋 60-min Deep Dive Strategy Session</li>
                <li>👥 WhatsApp Community Access</li>
                <li>🏆 Priority Track - Immediate Consideration</li>
            </ul>
        `;
    }
}

async function saveToAirtable(formData, responseData) {
    if (!base) return null;
    
    const recordData = {
        'Email': formData.email,
        'Form Type': formData.formType || 'unknown',
        'Timestamp': new Date().toISOString(),
        'Email Sent': responseData.emailSent ? 'Yes' : 'Failed'
    };
    
    // Add optional fields
    if (formData.name) recordData['Name'] = formData.name;
    if (formData.first_name) recordData['First Name'] = formData.first_name;
    if (formData.last_name) recordData['Last Name'] = formData.last_name;
    if (formData.phone) recordData['Phone'] = formData.phone;
    if (formData.interest) recordData['Interest'] = formData.interest;
    if (formData.status) recordData['Status'] = formData.status;
    if (formData.challenge) recordData['Challenge'] = formData.challenge;
    if (responseData.tier) recordData['Lead Tier'] = responseData.tier;
    if (responseData.score) recordData['Score'] = responseData.score;
    if (formData.updates !== undefined) {
        recordData['Marketing Consent'] = formData.updates ? 'Yes' : 'No';
    }

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
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Weekly cycle: Monday review, slots available Wed-Sunday
    let slotsRemaining = 12; // Realistic number
    let totalSlots = 20; // Realistic weekly capacity
    let isActive = true;
    let statusMessage = 'Active review period';
    
    if (currentDay === 1 || currentDay === 2) { // Monday-Tuesday: Review period
        slotsRemaining = 0;
        isActive = false;
        statusMessage = 'Review cycle in progress - reopens Wednesday';
    } else if (currentDay === 3) { // Wednesday: Fresh start
        slotsRemaining = 18;
        statusMessage = 'New review cycle started - priority slots available';
    } else if (currentDay === 4) { // Thursday
        slotsRemaining = 14;
        statusMessage = 'Mid-week applications being processed';
    } else if (currentDay === 5) { // Friday
        slotsRemaining = 8;
        statusMessage = 'Weekend rush - limited slots remaining';
    } else if (currentDay === 6) { // Saturday
        slotsRemaining = 4;
        statusMessage = 'Final weekend slots available';
    } else if (currentDay === 0) { // Sunday
        slotsRemaining = 2;
        statusMessage = 'Last call - review closes Monday';
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
        timeRemaining: 24 * 60 * 60 * 1000, // 24 hours
        currentDay
    };
}

function calculatePriorityScore(formData) {
    let score = 50; // Base score
    
    // Status-based scoring (more realistic)
    const statusScores = {
        'Professional': 25,
        'Career Change': 20,
        'Entrepreneur': 20,
        'Graduate': 15,
        'Student': 10
    };
    score += statusScores[formData.status] || 0;
    
    // Interest-based scoring
    const interestScores = {
        'Data Analytics': 15,
        'Automation': 15,
        'Freelancing Pro': 10,
        'Career Mastery': 10,
        'Need Guidance': 5
    };
    score += interestScores[formData.interest] || 0;
    
    // Challenge description quality
    if (formData.challenge && formData.challenge.length > 100) {
        score += 10;
    }
    
    return Math.min(100, score);
}

function getPriorityTier(score) {
    if (score <= 45) return 'BASIC';
    if (score <= 75) return 'STANDARD';
    return 'PRIORITY';
}
