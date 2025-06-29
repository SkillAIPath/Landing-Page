// netlify/functions/process-lead.js
const sgMail = require('@sendgrid/mail');
const Airtable = require('airtable');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const formData = JSON.parse(event.body);
        
        // Enhanced logging for debugging
        console.log('Received form data:', formData);
        
        // Get current urgency data
        const urgencyData = calculateUrgencyData();
        
        // Handle urgency check requests (don't save to database)
        if (formData.formType === 'urgency-check') {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    urgencyData: urgencyData,
                    message: 'Urgency data retrieved'
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

        if (isLeadMagnet) {
            // Handle lead magnet forms
            await handleLeadMagnet(formData);
            response.message = 'Check your email for the Enterprise Revenue Forecasting Blueprint download link!';
        } else {
            // Handle application forms
            const applicationResult = await handleApplication(formData);
            response = { ...response, ...applicationResult };
        }

        // Save to Airtable (except urgency checks)
        if (formData.formType !== 'urgency-check') {
            await saveToAirtable(formData, response);
        }

        // ✅ NEW: Always include updated urgency data in response
        response.urgencyData = urgencyData;

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error processing form:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error.message 
            })
        };
    }
};

        // Calculate dynamic urgency data with CORRECT MATH
function calculateUrgencyData() {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentHour = now.getHours();
    
    // Base slot tracking
    let slotsRemaining = 0;
    let totalSlots = 30;
    let isActive = true;
    let statusMessage = '';
    
    // Check if it's Monday (1) or Tuesday (2)
    if (currentDay === 1 || currentDay === 2) {
        slotsRemaining = 0;
        isActive = false;
        statusMessage = 'Review cycle closed - reopens Wednesday';
    } else {
        // Wednesday through Sunday - active period
        isActive = true;
        
        // Calculate base slots with some randomization
        const seed = getWeekSeed(); // Consistent seed for the week
        const randomFactor = (seed % 5) + 1; // 1-5 additional variance
        
        if (currentDay === 3) { // Wednesday
            slotsRemaining = 21 + randomFactor; // 22-26 slots
            totalSlots = 30; // Keep total consistent
        } else if (currentDay === 4) { // Thursday
            slotsRemaining = 16 + Math.floor(randomFactor/2); // 16-18 slots
            totalSlots = 30;
        } else if (currentDay === 5) { // Friday
            slotsRemaining = 11 + Math.floor(randomFactor/3); // 11-12 slots
            totalSlots = 30;
        } else if (currentDay === 6) { // Saturday
            slotsRemaining = 6 + Math.floor(randomFactor/5); // 6-7 slots
            totalSlots = 30;
        } else if (currentDay === 0) { // Sunday
            slotsRemaining = 2 + (randomFactor > 3 ? 1 : 0); // 2-3 slots
            totalSlots = 30;
        }
        
        // Add hourly variance (decrease throughout the day)
        if (currentHour > 12) {
            const hourlyDecrease = Math.floor((currentHour - 12) / 3); // Decrease every 3 hours after noon
            slotsRemaining = Math.max(1, slotsRemaining - hourlyDecrease);
        }
        
        // Generate realistic status messages with correct numbers AFTER hourly adjustments
        const slotsFilled = totalSlots - slotsRemaining;
        
        if (currentDay === 3) { // Wednesday  
            statusMessage = `Fresh batch opened! ${slotsFilled} early applications received`;
        } else if (currentDay === 4) { // Thursday
            const todayFilled = Math.min(4, Math.floor(Math.random() * 3) + 2); // 2-4 today
            statusMessage = `${todayFilled} professionals applied today (${slotsFilled} total this week)`;
        } else if (currentDay === 5) { // Friday
            const todayFilled = Math.min(5, Math.floor(Math.random() * 4) + 3); // 3-6 today  
            statusMessage = `Weekend rush - ${todayFilled} applications since morning`;
        } else if (currentDay === 6) { // Saturday
            statusMessage = `${slotsFilled} spots filled this week - ${slotsRemaining} final weekend slots`;
        } else if (currentDay === 0) { // Sunday
            statusMessage = `${slotsFilled} applications this week - only ${slotsRemaining} slots before Monday reset`;
        }
    }
    
    // CORRECT MATH: Calculate filled slots and percentage
    const slotsFilled = totalSlots - slotsRemaining;
    const progressPercentage = isActive ? Math.round((slotsFilled / totalSlots) * 100) : 0;
    
    // Calculate next reset time
    const nextReset = getNextMondayTime();
    const timeRemaining = nextReset - now;
    
    return {
        slotsRemaining,
        slotsFilled, // ✅ NEW: Correct filled count
        totalSlots,
        isActive,
        statusMessage,
        progressPercentage,
        timeRemaining,
        currentDay,
        nextResetTime: nextReset.toISOString()
    };
}

// Get consistent weekly seed for randomization
function getWeekSeed() {
    const now = new Date();
    const startOfWeek = new Date(now);
    
    // Get Monday of current week
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Use week start timestamp as seed
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
    const templateId = process.env.SENDGRID_BLUEPRINT_TEMPLATE_ID || 'd-your-template-id-here';
    
    const msg = {
        to: formData.email,
        from: {
            email: 'tech@skillaipath.com',
            name: 'Viresh - Skill AI Path'
        },
        templateId: templateId,
        dynamicTemplateData: {
            CUSTOMER_NAME: formData.name || 'Future Enterprise Builder',
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

    await sgMail.send(msg);
    console.log('Blueprint email sent to:', formData.email);
    
    // If user opted for updates, add them to marketing list
    if (formData.updates) {
        console.log('User opted for marketing updates:', formData.email);
        // Add to marketing automation here if needed
    }
}

async function handleApplication(formData) {
    // Calculate priority score
    const score = calculatePriorityScore(formData);
    const tier = getPriorityTier(score);
    
    // Send notification email to admin
    await sendAdminNotification(formData, score, tier);
    
    return {
        score: score,
        tier: tier,
        message: `Application submitted successfully! Priority Level: ${tier} (Score: ${score}/100)`
    };
}

function calculatePriorityScore(formData) {
    let score = 50; // Base score
    
    // Status scoring
    const statusScores = {
        'Professional': 25,
        'Career Change': 20,
        'Entrepreneur': 20,
        'Graduate': 15,
        'Student': 10
    };
    score += statusScores[formData.status] || 0;
    
    // Interest/Goal scoring
    const interestScores = {
        'Data Analytics': 15,
        'Automation': 15,
        'Freelancing Pro': 10,
        'Career Mastery': 10,
        'Need Guidance': 5
    };
    score += interestScores[formData.interest] || 0;
    
    // Challenge complexity scoring
    if (formData.challenge && formData.challenge.length > 100) {
        score += 10; // Detailed challenges get bonus points
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
        
    const phoneDisplay = formData.phone ? formData.phone : 'Not provided';
    const whatsappLink = formData.phone ? 
        `<a href="https://wa.me/${formData.phone.replace(/[^0-9]/g, '')}">${formData.phone}</a>` : 
        'No WhatsApp available';
        
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
                <p><strong>Phone:</strong> ${phoneDisplay}</p>
                <p><strong>Interest:</strong> ${formData.interest || 'N/A (Lead Magnet)'}</p>
                <p><strong>Status:</strong> ${formData.status || 'N/A (Lead Magnet)'}</p>
                <p><strong>Priority Score:</strong> ${score}/100 (${tier})</p>
                <p><strong>Source:</strong> ${getFormSource(formData.formType)}</p>
            </div>
            ${formData.challenge ? `
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Challenge/Goals:</h3>
                <p>${formData.challenge}</p>
            </div>
            ` : ''}
            <div style="background: #f3e5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>Quick Actions:</h3>
                <p>📞 WhatsApp: ${whatsappLink}</p>
                <p>📧 Email: <a href="mailto:${formData.email}">${formData.email}</a></p>
            </div>
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>Consent Status:</h3>
                <p><strong>Marketing Updates:</strong> ${formData.updates ? '✅ Yes' : '❌ No'}</p>
                <p><strong>Privacy Policy:</strong> ${formData.privacy ? '✅ Agreed' : '❌ Not Agreed'}</p>
                <p><strong>Phone Provided:</strong> ${formData.phone ? '✅ Yes' : '❌ No'}</p>
            </div>
        `
    };

    await sgMail.send(adminMsg);
}

async function saveToAirtable(formData, responseData) {
    const recordData = {
        'Name': formData.name || '',
        'First Name': formData.first_name || formData.name || '',
        'Last Name': formData.last_name || '',
        'Email': formData.email || '',
        'Phone': formData.phone || '', // ✅ Now handles phone from all forms
        'Interest': formData.interest || '',
        'Status': formData.status || '',
        'Challenge': formData.challenge || '',
        'Form Type': formData.formType || 'unknown',
        'Submission Date': new Date().toISOString(),
        'Priority Score': responseData.score || 0,
        'Priority Tier': responseData.tier || 'STANDARD',
        'Privacy Consent': formData.privacy ? 'Yes' : 'No',
        'Marketing Consent': formData.updates ? 'Yes' : 'No',
        'Source': getFormSource(formData.formType),
        'Has Phone': formData.phone ? 'Yes' : 'No' // ✅ Track if phone was provided
    };

    console.log('Saving to Airtable:', recordData);

    try {
        const record = await base('Applications').create(recordData);
        console.log('Successfully saved to Airtable:', record.id);
        return record;
    } catch (error) {
        console.error('Airtable save error:', error);
        throw new Error(`Failed to save to Airtable: ${error.message}`);
    }
}

function getFormSource(formType) {
    const sources = {
        'lead-magnet': 'Lead Magnet - Main Section (3 fields)',
        'landing-popup': 'Landing Popup - Timed (3 fields)',
        'exit-intent': 'Exit Intent Popup (3 fields)', 
        'contact': 'Contact Form - Main (Full Application)',
        'popup': 'Application Popup (Full Application)'
    };
    return sources[formType] || 'Unknown Source';
}