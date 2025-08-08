const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');
const fs = require('fs/promises');
const path = require('path');

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
                // response.bookingPage = getBookingPageUrl(applicationResult.score);
                // console.log(`📍 Redirect to: ${response.bookingPage}`);
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

// Updated sendBlueprintEmail function for process-lead.js
// Replace the existing sendBlueprintEmail function with this enhanced version

async function sendBluprintEma(formData) {
    console.log('📧 Sending enhanced blueprint email to:', formData.email);
    
    const customerName = formData.name || formData.first_name || 'Future Enterprise Builder';
    
    // Enhanced HTML template with professional styling
    const enhancedEmailHTML = `
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                max-width: 650px; 
                margin: 0 auto; 
                padding: 20px; 
                background-color: #f5f7fa;
                line-height: 1.6;
            }
            .email-container {
                background-color: white;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header { 
                text-align: center; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px 20px; 
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 700;
            }
            .header p {
                margin: 10px 0 0 0;
                font-size: 16px;
                opacity: 0.9;
            }
            .content { 
                padding: 30px; 
            }
            .download-box { 
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                color: white; 
                padding: 25px; 
                text-align: center; 
                border-radius: 12px; 
                margin: 25px 0; 
                box-shadow: 0 6px 20px rgba(79, 172, 254, 0.3);
            }
            .download-button { 
                background: linear-gradient(135deg, #56ab2f 0%, #a8e6cf 100%);
                color: white; 
                padding: 18px 35px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: bold; 
                font-size: 16px;
                display: inline-block;
                transition: transform 0.3s ease;
                box-shadow: 0 4px 15px rgba(86, 171, 47, 0.4);
            }
            .stats-container {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin: 25px 0;
                justify-content: space-between;
            }
            .stat-box {
                background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
                padding: 20px;
                border-radius: 10px;
                text-align: center;
                flex: 1;
                min-width: 140px;
                box-shadow: 0 3px 10px rgba(0,0,0,0.1);
            }
            .stat-number {
                font-size: 24px;
                font-weight: bold;
                color: #2c3e50;
                display: block;
            }
            .stat-label {
                font-size: 12px;
                color: #34495e;
                margin-top: 5px;
            }
            .quick-start {
                background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
                padding: 20px; 
                border-radius: 10px; 
                margin: 25px 0;
                border-left: 5px solid #fdcb6e;
            }
            .reply-section {
                background: linear-gradient(135deg, #e8f5e8 0%, #b8e6b8 100%);
                padding: 25px;
                border-radius: 12px;
                margin: 30px 0;
                border: 2px solid #27ae60;
            }
            .whatsapp-box {
                background: #25d366;
                color: white;
                padding: 15px;
                border-radius: 8px;
                margin: 15px 0;
                text-align: center;
            }
            .whatsapp-box a {
                color: white;
                text-decoration: none;
                font-weight: bold;
            }
            .modules-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin: 25px 0;
            }
            .module-card {
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                color: white;
                padding: 20px;
                border-radius: 10px;
                text-align: center;
                box-shadow: 0 4px 15px rgba(240, 147, 251, 0.3);
            }
            .module-card h4 {
                margin: 0 0 10px 0;
                font-size: 16px;
            }
            .module-card p {
                margin: 0;
                font-size: 14px;
                opacity: 0.9;
            }
            .icon {
                font-size: 24px;
                margin-right: 8px;
            }
            .footer-section {
                background: #2c3e50;
                color: white;
                padding: 25px;
                text-align: center;
            }
            .footer-section a {
                color: #3498db;
            }
            @media (max-width: 600px) {
                .stats-container {
                    flex-direction: column;
                }
                .modules-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1>🎯 Your Blueprint is Ready!</h1>
                <p>Enterprise Revenue Forecasting Implementation Guide</p>
            </div>

            <div class="content">
                <p>Hi <strong>${customerName}</strong>,</p>
                
                <p>Thanks for requesting the <strong>Enterprise Revenue Forecasting Blueprint</strong>. You're about to access a production-tested system that has helped organizations achieve measurable results in enterprise environments.</p>
                
                <div style="background: linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%); padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #4facfe;">
                    <p style="margin: 0; font-weight: bold; color: #2c3e50;">🎯 Enterprise-Grade Features:</p>
                    <ul style="margin: 10px 0 0 0; font-size: 14px; color: #2c3e50;">
                        <li><strong>Automated Drift Detection</strong> - Models monitor their own performance</li>
                        <li><strong>Weather API Integration</strong> - Real-time data for enhanced accuracy</li>
                        <li><strong>Production-Ready Code</strong> - Enterprise-tested Python, SQL, and DAX</li>
                        <li><strong>Comprehensive Monitoring</strong> - Automated alerts and health checks</li>
                        <li><strong>Complete Documentation</strong> - Every component fully documented</li>
                    </ul>
                </div>
                
                <div class="stats-container">
                    <div class="stat-box">
                        <span class="stat-number">23%</span>
                        <div class="stat-label">Forecast Accuracy Improvement</div>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number">$445K</span>
                        <div class="stat-label">Annual Operational Benefits</div>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number">245%</span>
                        <div class="stat-label">First Year ROI</div>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number">8 Days</span>
                        <div class="stat-label">Complete Implementation</div>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number">500K+</span>
                        <div class="stat-label">Sample Records Included</div>
                    </div>
                </div>

                <div class="download-box">
                    <p><strong>🔗 Direct Access Link:</strong></p>
                    <a href="https://drive.google.com/drive/folders/11l4e00K4qhioY2p_1BDzco49r6BjSbO4" class="download-button">
                        📥 Access Your Complete Blueprint Package
                    </a>
                    <p style="font-size: 14px; margin-top: 15px; opacity: 0.9;">
                        8 implementation modules • Production-ready code • Sample datasets • Business templates
                    </p>
                </div>

                <h3><span class="icon">📦</span>Complete Blueprint Package (8 Implementation Modules):</h3>
                
                <div class="modules-grid">
                    <div class="module-card">
                        <h4>📄 Module 1: Database Setup</h4>
                        <p>Complete PostgreSQL/SQL Server schema with indexes</p>
                    </div>
                    <div class="module-card">
                        <h4>🐍 Module 2: Python ML Pipeline</h4>
                        <p>Random Forest + Gradient Boosting with drift detection</p>
                    </div>
                    <div class="module-card">
                        <h4>🌤️ Module 3: Weather Integration</h4>
                        <p>OpenWeatherMap + WeatherAPI with rate limiting</p>
                    </div>
                    <div class="module-card">
                        <h4>📊 Module 4: Power BI Dashboards</h4>
                        <p>Executive dashboards with advanced DAX measures</p>
                    </div>
                    <div class="module-card">
                        <h4>🤖 Module 5: Model Monitoring</h4>
                        <p>Evidently AI drift detection with email/Slack alerts</p>
                    </div>
                    <div class="module-card">
                        <h4>🚀 Module 6: Deployment Guide</h4>
                        <p>8-day checklist with validation checkpoints</p>
                    </div>
                    <div class="module-card">
                        <h4>🔧 Module 7: Troubleshooting</h4>
                        <p>Emergency procedures and diagnostic scripts</p>
                    </div>
                    <div class="module-card">
                        <h4>📊 Module 8: Sample Data</h4>
                        <p>Realistic retail datasets with ingestion scripts</p>
                    </div>
                </div>

                <div class="quick-start">
                    <p><strong>🚀 Three Implementation Paths (from readme_start_here.md):</strong></p>
                    <p><strong>⚡ Path 1: Immediate Testing (30 minutes)</strong><br>
                    Start with <code>Module 8 (Sample Data)</code> → Run data generation script → Working forecasts in 30 minutes</p>
                    <p><strong>🏗️ Path 2: Component Building (2-4 hours)</strong><br>
                    Choose focus: Dashboard (Module 4), ML Pipeline (Module 2), or Monitoring (Module 5)</p>
                    <p><strong>🏢 Path 3: Full Enterprise Implementation (4 weeks)</strong><br>
                    Follow <code>Module 6 (Deployment Checklist)</code> → Complete production system with monitoring</p>
                    <p><strong>💡 Pro Tip:</strong> Most people start with Module 8 for immediate hands-on experience with realistic retail data!</p>
                </div>

                <div class="reply-section">
                    <h3 style="color: #27ae60; margin-top: 0;">📞 Implementation Support & Community</h3>
                    
                    <div class="whatsapp-box">
                        <p style="margin: 0;"><strong>📱 <a href="https://chat.whatsapp.com/Ljq76ZIK1BrHJF50RP3IYE">Join WhatsApp Community</a></strong></p>
                        <p style="margin: 5px 0 0 0; font-size: 14px;">Connect with other implementers and get instant help</p>
                    </div>

                    <p><strong>When reaching out, please include:</strong></p>
                    <ul style="margin: 15px 0;">
                        <li>📁 <strong>What file/module</strong> you're having trouble with</li>
                        <li>❓ <strong>Your exact query</strong> or error message</li>
                        <li>📸 <strong>Screenshots</strong> of any error messages or unexpected results</li>
                        <li>💻 <strong>Your setup</strong> (Database type, Python version, etc.)</li>
                    </ul>

                    <div style="background: #fff; padding: 15px; border-radius: 8px; border-left: 4px solid #3498db;">
                        <p style="margin: 0;"><strong>📋 Community Guidelines:</strong></p>
                        <p style="margin: 10px 0 0 0; font-size: 14px;">
                            • <strong>List multiple questions at once</strong> for efficient help<br>
                            • <strong>Send between 7 AM - 5 PM</strong> for fastest response<br>
                            • <strong>Allow up to 72 hours</strong> for detailed technical responses<br>
                            • <strong>Keep implementing</strong> other modules while waiting for support<br>
                            • <strong>Share your wins!</strong> Help others by posting successful implementations
                        </p>
                    </div>

                    <p style="margin-top: 15px;"><strong>🔧 Self-Help Resources:</strong></p>
                    <p style="margin: 5px 0; font-size: 14px;">
                        • <strong>Module 7 (Troubleshooting)</strong> covers 95% of common issues<br>
                        • <strong>Code comments</strong> include detailed explanations<br>
                        • <strong>Sample data</strong> helps isolate implementation vs. data issues
                    </p>
                </div>

                <p>This production-tested blueprint includes complete implementations from database setup through advanced monitoring. Based on real enterprise deployments with documented results.</p>

                <p style="margin-top: 30px;">Best regards,<br>
                <strong>Viresh Gendle</strong><br>
                <em>Founder, Skill AI Path</em><br>
                📧 tech@skillaipath.com | 🌐 skillaipath.com</p>
            </div>

            <div class="footer-section">
                <p style="margin: 0;"><strong>© 2024 Skill AI Path. All Rights Reserved.</strong></p>
                <p style="margin: 10px 0 0 0; font-size: 14px;">
                    Enterprise Revenue Forecasting Blueprint by Viresh Gendle<br>
                    Licensed for educational and internal business use. Attribution required when sharing.<br>
                    Questions? Reply to this email or join our implementation community.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
    
    const msg = {
        to: formData.email,
        from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
        },
        subject: '🎯 Your Enterprise Revenue Forecasting Blueprint is Ready!',
        html: enhancedEmailHTML
    };
    
    const result = await sgMail.send(msg);
    console.log('✅ Enhanced blueprint email sent:', result[0]?.statusCode);
    console.log('✅ Enhanced blueprint email sent:', result[0]?.statusCode);
    return result;
}

async function handleApplicati(formData) {
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
async function getTemplateBySce(score) {
  let fileName = 'basic-qualified.html';

  if (score > 49 && score <= 69) {
    fileName = 'standard-qualified.html';
  } else if (score > 69) {
    fileName = 'priority-qualified.html';
  }

  const siteUrl = process.env.URL || 'https://skillaipath.com/';
  const templateUrl = `${siteUrl}/booking-pages/${fileName}`;

  console.log('🌐 Fetching template from:', templateUrl);

  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.statusText}`);

  return await res.text();
}




async function sendAdminNotification(formData, score, tier) {
    const fullName = formData.first_name && formData.last_name 
        ? `${formData.first_name} ${formData.last_name}`
        : formData.name || 'No name provided';

    const htmlTemplate = await getTemplateByScore(score);

    const msg = {
        to: [formData.email, 'tech@skillaipath.com'],
        from: {
            email: 'tech@skillaipath.com',
            name: 'Skill AI Path Application System'
        },
        subject: `🎯 New ${tier} Priority Application - ${fullName}`,
        html: htmlTemplate
    };

    const result = await sgMail.send(msg);
    return result;
}


const interestMap = {
  'data analytics': 'Build analytics solutions',
  'automation': 'Create automation',
  'freelancing pro': 'Master client delivery',
  'career mastery': 'Plan career transition',
  'need guidance': 'Need track guidance'
};

const statusMap = {
  'student': 'College Student',
  'graduate': 'Recent Graduate',
  'professional': 'Working Professional',
  'career change': 'Planning Career Change',
  'entrepreneur': 'Building Business'
};

const tierMap = {
  HIGH: 'HOT',
  MEDIUM: 'WARM',
  STANDARD: 'COLD'
};


// Rest of the functions remain the same...
const allowedInterests = [
    'Create automation',
    'Run webinar',
    'Track engagement',
    // ✅ Add all valid select options from Airtable here
];

const allowedStatuses = [
    'New',
    'Contacted',
    'Qualified',
    // ✅ Add all valid status options
];

const allowedTiers = [
    'Priority',
    'Standard',
    'Basic',
    // ✅ Match the exact options from Airtable
];

async function saveToAirtable(formData, responseData) {
    console.log('📥 Incoming form data:', formData);
    if (!base) return null;

    const recordData = {};

    // Basic fields
    if (formData.name) recordData['Name'] = formData.name;
    if (formData.first_name) recordData['First Name'] = formData.first_name;
    if (formData.last_name) recordData['Last Name'] = formData.last_name;
    if (formData.phone) recordData['Phone'] = formData.phone;
    if (formData.challenge) recordData['Challenge'] = formData.challenge;

    // Marketing consent
    if (formData.updates !== undefined) {
        recordData['Marketing Consent'] = formData.updates ? 'Yes' : 'No';
    }

    // Interest field (mapped + validated)
    const mappedInterest = interestMap[formData.interest];
    if (mappedInterest && allowedInterests.includes(mappedInterest)) {
        recordData['Interest'] = mappedInterest;
    }

    // Status field (mapped + validated)
    const mappedStatus = statusMap[formData.status];
    if (mappedStatus && allowedStatuses.includes(mappedStatus)) {
        recordData['Status'] = mappedStatus;
    }

    const mappedTier = tierMap[responseData.tier];
    if (mappedTier && allowedTiers.includes(mappedTier)) {
        recordData['Lead Tier'] = mappedTier;
    }

    // Email sent status
    recordData['Email Sent'] = responseData.emailSent === true;

    recordData['Email'] = formData.email;

    recordData['Current Situation'] = formData.q1_current_situation;
    recordData['Daily Learning Commitment'] = formData.q2_daily_commitment;
    recordData['Technical Background'] = formData.q3_technical_background;
    recordData['Financial Readiness'] = formData.q4_financial_readiness;
    recordData['When do you plan to start?'] = formData.q5_starting_timeline;
    

    try {
        const record = await base('tblALnkQGWD2zWRSw').create(recordData);
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
    let totalSlots = 30; // Realistic weekly capacity
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

// function calculatePriorityScore(formData) {
//     let score = 50; // Base score
    
//     // Status-based scoring (more realistic)
//     const statusScores = {
//         'Professional': 25,
//         'Career Change': 20,
//         'Entrepreneur': 20,
//         'Graduate': 15,
//         'Student': 10
//     };
//     score += statusScores[formData.status] || 0;
    
//     // Interest-based scoring
//     const interestScores = {
//         'Data Analytics': 15,
//         'Automation': 15,
//         'Freelancing Pro': 10,
//         'Career Mastery': 10,
//         'Need Guidance': 5
//     };
//     score += interestScores[formData.interest] || 0;
    
//     // Challenge description quality
//     if (formData.challenge && formData.challenge.length > 100) {
//         score += 10;
//     }
    
//     return Math.min(100, score);
// }



function calculatePriorityScore(formData) {
    let score = 0;

    // Question 1: Current Situation
    switch (formData.q1_current_situation) {
        case 'IT/CS Student (1st-3rd year)':
            score += 20;
            break;
        case 'Other Field Student (1st-3rd year)':
            score += 17;
            break;
        case 'Working Professional (Career change)':
            score += 14;
            break;
        case 'Recent Graduate (No job)':
            score += 14;
            break;
        case 'Final Year Student (Any field)':
            score += 12;
            break;
        case 'IT Professional (Skill upgrade)':
            score += 7;
            break;
        case 'Entrepreneur/Business Owner':
            score += 5;
            break;
        default:
            score += 0; // No points for unrecognized options
    }

    // Question 2: Daily Learning Commitment
    switch (formData.q2_daily_commitment) {
        case '6+ hours daily':
            score += 20;
            break;
        case '4-6 hours daily':
            score += 16;
            break;
        case '2-4 hours daily':
            score += 10;
            break;          
        case 'Under 2 hours daily':
            score += 4;
            break;
        default:
            score += 0; // No points for unrecognized options
    }

    // Question 3: Technical Background
    switch (formData.q3_technical_background) {
        case 'Complete Beginner':
            score += 20;
            break;
        case 'Basic Programming (Python/SQL basics)':
            score += 16;
            break;
        case 'Excel/Analytics Experience':
            score += 12;
            break;
        case 'Uses AI Tools (ChatGPT, etc.)':
            score += 8;
            break;
        case 'Advanced Technical (Can build apps)':
            score += 4;
            break;
        default:
            score += 0; // No points for unrecognized options
    }

    // Question 4: Financial Readiness
    switch (formData.q4_financial_readiness) {
        case 'Ready to Pay (Family support)':
            score += 20;
            break;
        case 'Personal Savings (Ready to invest)':
            score += 16;
            break;
        case 'EMI Preferred (Has card/income)':
            score += 12;
            break;
        case 'Limited Budget (Student/No income)':
            score += 8;
            break;
        default:
            score += 0; // No points for unrecognized options
    }

    // Question 5: Starting Timeline
    switch (formData.q5_starting_timeline) {
        case 'Within 1 week':
            score += 20;
            break;
        case 'Within 1 month':
            score += 16;
            break;
        case 'Within 3 months':
            score += 10;
            break;
        case 'Just exploring':
            score += 4;
            break;
        default:
            score += 0; // No points for unrecognized options
    }   

    // Ensure score is capped at 100
    return Math.min(100, score);
}



function getPriorityTier(score) {
    if (score <= 49) return 'BASIC';
    if (score <= 69) return 'STANDARD';
    return 'PRIORITY';
}

