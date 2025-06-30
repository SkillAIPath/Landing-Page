// netlify/functions/process-lead.js
const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid initialized');
} else {
    console.log('❌ SendGrid API key missing');
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
        
        console.log('📝 Received form data:', {
            formType: formData.formType,
            email: formData.email,
            hasName: !!formData.name,
            hasFirstName: !!formData.first_name,
            hasPhone: !!formData.phone
        });
        
        // Get current urgency data
        const urgencyData = calculateUrgencyData();
        
        // Handle urgency check requests
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

        // Handle emails with detailed logging
        let emailSuccess = false;
        try {
            if (isLeadMagnet) {
                console.log('📧 Sending lead magnet email...');
                await handleLeadMagnet(formData);
                response.message = 'Success! Check your email for the Enterprise Revenue Forecasting Blueprint download link.';
                emailSuccess = true;
                console.log('✅ Lead magnet email sent successfully');
            } else {
                console.log('📧 Processing application...');
                const applicationResult = await handleApplication(formData);
                response = { ...response, ...applicationResult };
                emailSuccess = true;
                console.log('✅ Application processed successfully');
            }
        } catch (emailError) {
            console.error('❌ Email sending failed:', emailError);
            console.error('Email error details:', {
                name: emailError.name,
                message: emailError.message,
                code: emailError.code,
                response: emailError.response?.body
            });
            response.emailWarning = 'Form submitted but email may be delayed';
            response.emailError = emailError.message;
        }

        // Save to Airtable
        try {
            if (formData.formType !== 'urgency-check') {
                console.log('💾 Saving to Airtable...');
                await saveToAirtable(formData, response);
                console.log('✅ Airtable save completed');
            }
        } catch (airtableError) {
            console.error('❌ Airtable save failed:', airtableError);
            response.airtableWarning = 'Data saved locally but sync may be delayed';
        }

        // Always include updated urgency data
        response.urgencyData = urgencyData;
        response.emailSent = emailSuccess;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('💥 Function error:', error);
        
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

async function handleLeadMagnet(formData) {
    if (!process.env.SENDGRID_API_KEY) {
        throw new Error('SendGrid API key not configured');
    }
    
    if (!formData.email) {
        throw new Error('Email is required for blueprint delivery');
    }
    
    console.log('📧 Preparing lead magnet email for:', formData.email);
    
    const customerName = formData.name || formData.first_name || 'Future Enterprise Builder';
    
    // Use simple email instead of template if template ID not set
    let msg;
    
    if (process.env.SENDGRID_BLUEPRINT_TEMPLATE_ID && process.env.SENDGRID_BLUEPRINT_TEMPLATE_ID !== 'd-your-template-id-here') {
        // Use template
        msg = {
            to: formData.email,
            from: {
                email: 'tech@skillaipath.com',
                name: 'Viresh - Skill AI Path'
            },
            templateId: process.env.SENDGRID_BLUEPRINT_TEMPLATE_ID,
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
        console.log('📧 Using SendGrid template:', process.env.SENDGRID_BLUEPRINT_TEMPLATE_ID);
    } else {
        // Use simple HTML email
        msg = {
            to: formData.email,
            from: {
                email: 'tech@skillaipath.com',
                name: 'Viresh - Skill AI Path'
            },
            subject: '🎁 Your Enterprise Revenue Forecasting Blueprint is Ready!',
            html: `
                <h2>Hello ${customerName}!</h2>
                <p>Thank you for downloading the <strong>Enterprise Revenue Forecasting Blueprint</strong>.</p>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>📥 What's Inside Your Blueprint:</h3>
                    <ul>
                        <li>✅ Complete project architecture & system design</li>
                        <li>✅ Python code with Databricks Community edition</li>
                        <li>✅ SQL database schema & data pipeline</li>
                        <li>✅ Power BI dashboard templates</li>
                        <li>✅ Business presentation deck</li>
                        <li>✅ Step-by-step implementation guide</li>
                    </ul>
                </div>
                
                <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>🚀 Download Your Blueprint:</h3>
                    <p><a href="https://github.com/SkillAIPath/Enterprise-Revenue-Forecasting-Blueprint" style="background: #667eea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">📥 Download Complete Blueprint</a></p>
                </div>
                
                <p><strong>Next Steps:</strong></p>
                <p>Ready to build real enterprise solutions? Our custom learning tracks help professionals master AI & Data skills through hands-on business projects.</p>
                
                <p>Questions? Reply to this email or WhatsApp: <strong>+91 9301310154</strong></p>
                
                <p>Best regards,<br>
                <strong>Viresh Gendle</strong><br>
                AI & Cloud Architect<br>
                Skill AI Path</p>
                
                <div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px; font-size: 12px; color: #666;">
                    <p>Marketing Updates: ${formData.updates ? 'Yes' : 'No'} | Source: ${getFormSource(formData.formType)}</p>
                </div>
            `
        };
        console.log('📧 Using simple HTML email (no template)');
    }
    
    console.log('📧 Sending email to:', formData.email);
    const result = await sgMail.send(msg);
    console.log('✅ Email sent successfully. SendGrid response:', result[0].statusCode);
    
    return result;
}

async function handleApplication(formData) {
    const score = calculatePriorityScore(formData);
    const tier = getPriorityTier(score);
    
    console.log('📊 Application scored:', { score, tier });
    
    if (process.env.SENDGRID_API_KEY) {
        console.log('📧 Sending admin notification...');
        await sendAdminNotification(formData, score, tier);
        console.log('✅ Admin notification sent');
    } else {
        console.log('⚠️ SendGrid not configured - skipping admin notification');
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
        subject: `🎯 New ${tier} Priority Application - ${fullName}`,
        html: `
            <h2>🎯 New Application Received</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>👤 Applicant Details:</h3>
                <p><strong>Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${formData.email}</p>
                <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
                <p><strong>Interest:</strong> ${formData.interest || 'Not specified'}</p>
                <p><strong>Status:</strong> ${formData.status || 'Not specified'}</p>
                <p><strong>Priority Score:</strong> ${score}/100 (${tier})</p>
                <p><strong>Source:</strong> ${getFormSource(formData.formType)}</p>
                <p><strong>Timestamp:</strong> ${new Date().toLocaleString('en-IN')}</p>
            </div>
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>💭 Challenge/Goals:</h3>
                <p>${formData.challenge || 'Not provided'}</p>
            </div>
            <div style="background: #f3e5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>📞 Quick Actions:</h3>
                <p>📞 WhatsApp: <a href="https://wa.me/${formData.phone?.replace(/[^0-9]/g, '')}">${formData.phone || 'Not provided'}</a></p>
                <p>📧 Email: <a href="mailto:${formData.email}">${formData.email}</a></p>
            </div>
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>✅ Consent Status:</h3>
                <p><strong>Marketing Updates:</strong> ${formData.updates ? '✅ Yes' : '❌ No'}</p>
                <p><strong>Privacy Policy:</strong> ${formData.privacy ? '✅ Agreed' : '❌ Not Agreed'}</p>
            </div>
        `
    };

    const result = await sgMail.send(msg);
    console.log('✅ Admin notification sent. Status:', result[0].statusCode);
    return result;
}

async function saveToAirtable(formData, responseData) {
    if (!base || !process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
        console.log('⚠️ Airtable not configured - skipping save');
        return null;
    }
    
    const recordData = {};
    
    // Handle name fields
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

    console.log('💾 Saving to Airtable:', recordData);

    try {
        const tableNames = ['Table 1', 'Applications', 'Leads'];
        let record = null;
        
        for (const tableName of tableNames) {
            try {
                record = await base(tableName).create(recordData);
                console.log(`✅ Saved to Airtable table "${tableName}":`, record.id);
                break;
            } catch (tableError) {
                console.log(`❌ Table "${tableName}" failed:`, tableError.message);
                continue;
            }
        }
        
        return record;
    } catch (error) {
        console.error('❌ Airtable save error:', error);
        return null;
    }
}

// Urgency and scoring functions (same as before)
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