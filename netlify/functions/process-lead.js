// Updated JavaScript for index.html - Replace existing form submission functions

// Enhanced form submission functions
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    submitToBackend(this, 'contact');
});

document.getElementById('popupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    submitToBackend(this, 'popup');
});

document.getElementById('leadForm').addEventListener('submit', function(e) {
    e.preventDefault();
    submitToBackend(this, 'lead-magnet');
});

document.getElementById('landingPopupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    submitToBackend(this, 'landing-popup');
});

document.getElementById('exitForm').addEventListener('submit', function(e) {
    e.preventDefault();
    submitToBackend(this, 'exit-intent');
});

// Updated function to call the unified process-lead endpoint
async function submitToBackend(form, formType) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    data.formType = formType;
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    // Update button state
    submitBtn.textContent = '⏳ Submitting...';
    submitBtn.disabled = true;
    
    try {
        // Call the unified process-lead function
        const response = await fetch('/.netlify/functions/process-lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            handleFormSuccess(formType, form, submitBtn, originalText, result);
            console.log('Success:', result);
        } else {
            throw new Error(result.error || 'Submission failed');
        }
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Something went wrong. Please try again or contact us directly at tech@skillaipath.com');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function handleFormSuccess(formType, form, submitBtn, originalText, result) {
    const isLeadMagnet = ['lead-magnet', 'landing-popup', 'exit-intent'].includes(formType);
    
    if (isLeadMagnet) {
        // For lead magnet forms
        submitBtn.textContent = '✅ Check Your Email!';
        alert('🎉 Success! Check your email for the Enterprise Revenue Forecasting Blueprint download link.');
        
        // Close popups
        if (form.closest('.landing-popup')) {
            setTimeout(closeLandingPopup, 2000);
        } else if (form.closest('.exit-intent-popup')) {
            setTimeout(closeExitIntent, 2000);
        }
        
    } else {
        // For application forms
        submitBtn.textContent = '✅ Application Submitted!';
        
        // Show different messages based on tier (if available)
        if (result.tier && result.score) {
            alert(`✅ Application submitted successfully! Priority Level: ${result.tier} (Score: ${result.score}/100). We will review and contact you via WhatsApp/Email within 72 hours with your custom track options.`);
        } else {
            alert('✅ Application submitted successfully! We will review and contact you via WhatsApp/Email within 72 hours with your custom track options.');
        }
        
        // Close popup if it's the popup form
        if (form.closest('.popup-modal')) {
            setTimeout(closePopup, 2000);
        }
    }
    
    // Reset form after delay
    setTimeout(() => {
        form.reset();
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }, 3000);
    
    // Track conversion for analytics
    if (typeof gtag !== 'undefined') {
        gtag('event', 'form_submit', {
            'form_type': formType,
            'event_category': 'Lead Generation',
            'event_label': formType
        });
    }
}
