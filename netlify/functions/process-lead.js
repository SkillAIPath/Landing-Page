// netlify/functions/process-lead.js - DIAGNOSTIC VERSION
const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');
const fs = require('fs/promises');
const path = require('path');

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

// Updated sendBlueprintEmail function for process-lead.js
// Replace the existing sendBlueprintEmail function with this enhanced version

async function sendBlueprintEmail(formData) {
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
async function getTemplateByScore(score) {

    let fileName = 'basic-qualified.html';

    if (score > 45 && score <= 75) {
        fileName = 'standard-qualified.html';
    } else if (score > 75) {
        fileName = 'priority-qualified.html';
    }

    const filePath = path.join(__dirname, '../../booking-pages', fileName);
    return fs.readFile(filePath, 'utf-8');
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
  'Data Analytics': 'Build analytics solutions',
  'Automation': 'Create automation',
  'Freelancing Pro': 'Master client delivery',
  'Career Mastery': 'Plan career transition',
  'Need Guidance': 'Need track guidance'
};

const statusMap = {
  'Student': 'College Student',
  'Graduate': 'Recent Graduate',
  'Professional': 'Working Professional',
  'Career Change': 'Planning Career Change',
  'Entrepreneur': 'Building Business'
};

const tierMap = {
  HIGH: 'HOT',
  MEDIUM: 'WARM',
  STANDARD: 'COLD'
};


// Rest of the functions remain the same...
async function saveToAirtable(formData, responseData) {
    if (!base) return null;
    
    const recordData = {};
    if (formData.name) recordData['Name'] = formData.name;
    if (formData.first_name) recordData['First Name'] = formData.first_name;
    if (formData.email) recordData['Email'] = formData.email;
    if (formData.phone) recordData['Phone'] = formData.phone;
    // if (formData.interest) recordData['Interest'] = formData.interest;
    if (formData.interest && interestMap[formData.interest]) {
        recordData['Interest'] = interestMap[formData.interest];
    }
    // if (formData.status) recordData['Status'] = formData.status;
    if (formData.status && statusMap[formData.status]) {
        recordData['Status'] = statusMap[formData.status];
    }
    if (formData.challenge) recordData['Challenge'] = formData.challenge;
    recordData['Form Type'] = formData.formType || 'unknown';
    if (formData.updates !== undefined) {
        recordData['Marketing Consent'] = formData.updates ? 'Yes' : 'No';
    }
    // if (responseData.tier) {
    //     recordData['Lead Tier'] = responseData.tier;
    // }
    if (responseData.tier && tierMap[responseData.tier]) {
        recordData['Lead Tier'] = tierMap[responseData.tier];
    }
    // recordData['Email Sent'] = responseData.emailSent ? 'Yes' : 'Failed';
    recordData['Email Sent'] = responseData.emailSent === true;


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