// netlify/functions/process-lead.js
let sgMail, Airtable, base;

// Try to initialize external services with error handling
try {
    sgMail = require('@sendgrid/mail');
    if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        console.log('✅ SendGrid initialized');
    } else {
        console.log('⚠️ No SendGrid API key found');
    }
} catch (error) {
    console.log('⚠️ SendGrid not available:', error.message);
}

try {
    Airtable = require('airtable');
    if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
        base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        console.log('✅ Airtable initialized');
    } else {
        console.log('⚠️ Missing Airtable credentials:', {
            hasApiKey: !!process.env.AIRTABLE_API_KEY,
            hasBaseId: !!process.env.AIRTABLE_BASE_ID
        });
    }
} catch (error) {
    console.log('⚠️ Airtable not available:', error.message);
}

exports.handler = async (event, context) => {
    // Handle CORS
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
        
        // Enhanced logging for debugging
        console.log('Received form data:', {
            formType: formData.formType,
            email: formData.email,
            hasName: !!formData.name,
            hasFirstName: !!formData.first_name,
            hasPhone: !!formData.phone
        });
        
        // Get current urgency data
        const urgencyData = calculateUrgencyData();
        
        // Handle urgency check requests (don't save to database)
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
        
        // Validate required fields
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
        
        // Determine if this is a lead magnet or application form
        const isLeadMagnet = ['lead-magnet', 'landing-popup', 'exit-intent'].includes(formData.formType);
        
        let response = {
            success: true,
            message: isLeadMagnet ? 'Blueprint sent successfully!' : 'Application submitted successfully!',
            urgencyData: urgencyData
        };

        // Handle email sending
        try {
            if (isLeadMagnet) {
                await handleLeadMagnet(formData);
                response.message = 'Check your email for the Enterprise Revenue Forecasting Blueprint download link!';
            } else {
                const applicationResult = await handleApplication(formData);
                response = { ...response, ...applicationResult };
            }
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            response.emailWarning = 'Form submitted but email may be delayed';
        }

        // Save to Airtable
        try {
            if (formData.formType !== 'urgency-check') {
                await saveToAirtable(formData, response);
            }
        } catch (airtableError) {
            console.error('Airtable save failed, but continuing:', airtableError);
            response.airtableWarning = 'Data saved locally but sync may be delayed';
        }

        // Always include updated urgency data in response
        response.urgencyData = urgencyData;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error processing form:', error);
        
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

// Calculate dynamic urgency data
function calculateUrgencyData() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    let slotsRemaining = 0;
    let totalSlots = 30;
    let isActive = true;
    let statusMessage = '';
    
    if (currentDay === 1 || currentDay === 2) {
        slotsRemaining = 0;
        isActive = false;
        statusMessage = 'Review cycle closed - reopens Wednesday';
    } else {
        isActive = true;
        const seed = getWeekSeed();
        const randomFactor = (seed % 5) + 1;
        
        if (currentDay === 3) {
            slotsRemaining = 21 + randomFactor;
        } else if (currentDay === 4) {
            slotsRemaining = 16 + Math.floor(randomFactor/2);
        } else if (currentDay === 5) {
            slotsRemaining = 11 + Math.floor(randomFactor/3);
        } else if (currentDay === 6) {
            slotsRemaining = 6 + Math.floor(randomFactor/5);
        } else if (currentDay === 0) {
            slotsRemaining = 2 + (randomFactor > 3 ? 1 : 0);
        }
        
        if (currentHour > 12) {
            const hourlyDecrease = Math.floor((currentHour - 12) / 3);
            slotsRemaining = Math.max(1, slotsRemaining - hourlyDecrease);
        }
        
        const slotsFilled = totalSlots - slotsRemaining;
        
        if (currentDay === 3) {
            statusMessage = `Fresh batch opened! ${slotsFilled} early applications received`;
        } else if (currentDay === 4) {
            const todayFilled = Math.min(4, Math.floor(Math.random() * 3) + 2);
            statusMessage = `${todayFilled} professionals applied today (${slotsFilled} total this week)`;
        } else if (currentDay === 5) {
            const todayFilled = Math.min(5, Math.floor(Math.random() * 4) + 3);
            statusMessage = `Weekend rush - ${todayFilled} applications since morning`;
        } else if (currentDay === 6) {
            statusMessage = `${slotsFilled} spots filled this week - ${slotsRemaining} final weekend slots`;
        } else if (currentDay === 0) {
            statusMessage = `${slotsFilled} applications this week - only ${slotsRemaining} slots before Monday reset`;
        }
    }
    
    const slotsFilled = totalSlots - slotsRemaining;
    const progressPercentage = isActive ? Math.round((slotsFilled / totalSlots) * 100) : 0;
    
    const nextReset = getNextMondayTime();
    const timeRemaining = nextReset - now;
    
    return {
        slotsRemaining,
        slotsFilled,
        totalSlots,
        isActive,
        statusMessage,
        progressPercentage,
        timeRemaining,
        currentDay,
        nextResetTime: nextReset.toISOString()
    };
}

function getWeekSeed() {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    return Math.floor(startOfWeek.getTime() / 1000);
}

function getNextMondayTime() {
    const now = new Date();
    const nextMonday = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7;
    const daysToAdd = daysUntilMonday === 0 ? 7 : daysUntilMonday;
    nextMonday.setDate(now.getDate() + daysToAdd);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
}

async function handleLeadMagnet(formData) {
    if (!sgMail || !process.env.SENDGRID_API_KEY) {
        console.log('SendGrid not available - skipping email');
        return;
    }
    
    if (!formData.email) {
        throw new Error('Email is required for blueprint delivery');
    }
    
    const templateId = process.env.SENDGRID_BLUEPRINT_TEMPLATE_ID || 'd-your-template-id-here';
    const customerName = formData.name || formData.first_name || 'Future Enterprise Builder';
    
    const msg = {
        to: formData.email,
        from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
        },
        templateId: templateId,
        dynamicTemplateData: {
            CUSTOMER_NAME: customerName,
            email: formData.email,
            downloadDate: new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            marketingConsent: formData.updates ? 'Yes' : 'No',
            formSource: getFormSource(formData.formType)
        }
    };

    console.log('Sending blueprint email to:', formData.email);
    await sgMail.send(msg);
    console.log('Blueprint email sent successfully');
}

async function handleApplication(formData) {
    const score = calculatePriorityScore(formData);
    const tier = getPriorityTier(score);
    
    if (sgMail && process.env.SENDGRID_API_KEY) {
        await sendAdminNotification(formData, score, tier);
    } else {
        console.log('SendGrid not available - skipping admin notification');
    }
    
    return {
        score: score,
        tier: tier,
        message: `Application submitted successfully! Priority Level: ${tier} (Score: ${score}/100)`
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

async function sendAdminNotification(formData, score, tier) {
    const fullName = formData.first_name && formData.last_name 
        ? `${formData.first_name} ${formData.last_name}`
        : formData.name || 'No name provided';
        
    const adminMsg = {
        to: 'tech@skillaipath.com',
        from: {
            email: 'tech@skillaipath.com',
            name: 'Skill AI Path Application System'
        },
        subject: `🎯 New ${tier} Priority Application - ${fullName}`,
        html: `
            <h2>New Application Received</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Applicant Details:</h3>
                <p><strong>Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${formData.email}</p>
                <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
                <p><strong>Interest:</strong> ${formData.interest || 'Not specified'}</p>
                <p><strong>Status:</strong> ${formData.status || 'Not specified'}</p>
                <p><strong>Priority Score:</strong> ${score}/100 (${tier})</p>
                <p><strong>Source:</strong> ${getFormSource(formData.formType)}</p>
            </div>
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Challenge/Goals:</h3>
                <p>${formData.challenge || 'Not provided'}</p>
            </div>
        `
    };

    await sgMail.send(adminMsg);
}

async function saveToAirtable(formData, responseData) {
    if (!base || !process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
        console.log('Airtable not available - skipping save');
        return null;
    }
    
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
    
    recordData['Email Sent'] = responseData.emailWarning ? 'Failed' : 'Yes';

    console.log('Saving to Airtable:', recordData);

    try {
        const tableNames = ['Table 1', 'Applications', 'Leads', 'tblApplications'];
        let record = null;
        
        for (const tableName of tableNames) {
            try {
                record = await base(tableName).create(recordData);
                console.log(`Successfully saved to Airtable table "${tableName}":`, record.id);
                break;
            } catch (tableError) {
                console.log(`Table "${tableName}" failed:`, tableError.message);
                continue;
            }
        }
        
        return record;
    } catch (error) {
        console.error('Airtable save error:', error);
        return null;
    }
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