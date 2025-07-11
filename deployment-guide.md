# 🚀 Complete Deployment Guide - Skill AI Path

## 📁 **Final File Structure**

Create this exact folder structure on your computer:

```
skill-ai-path/
├── index.html                          # ✅ Main landing with forms
├── privacy-policy.html                 # ✅ Privacy policy page
├── netlify.toml                        # ✅ Netlify configuration
├── _redirects                          # ✅ URL routing rules
├── _headers                            # ✅ Security headers
├── dp.jpg                              # 📸 Your instructor photo
├── booking-pages/
│   ├── priority-qualified.html         # ✅ 85+ score booking
│   ├── standard-qualified.html         # ✅ 65-84 score booking
│   ├── basic-qualified.html           # ✅ 45-64 score booking
│   └── general-webinar.html           # ✅ <45 score workshop
├── confirmation-pages/
│   ├── confirmation-priority.html      # ✅ Priority confirmation
│   ├── confirmation-standard.html      # ✅ Standard confirmation
│   ├── confirmation-basic.html         # ✅ Basic confirmation
│   └── confirmation-general.html       # ✅ General confirmation
└── netlify/
    └── functions/
        └── process-lead.js              # ✅ Lead processing function
```

---

## 🛠️ **Step-by-Step Deployment**

### **Step 1: Create Project Folder**
```bash
mkdir skill-ai-path
cd skill-ai-path
```

### **Step 2: Copy All Files**
1. Copy the `index.html` from the updated version (with Netlify integration)
2. Copy all booking pages from previous artifacts
3. Copy all confirmation pages from previous artifacts
4. Copy `privacy-policy.html`
5. Create `netlify.toml`, `_redirects`, `_headers` files
6. Create `netlify/functions/` folder and add `process-lead.js`

### **Step 3: Add Your Instructor Photo**
- Add your photo as `dp.jpg` in the root folder
- Recommended size: 400x400px, square format
- If no photo available, the page will show initials "VG"

### **Step 4: Update Calendly URLs**
Replace these placeholder URLs in ALL booking pages:

**Current placeholders:**
```
https://calendly.com/your-calendly/15min-priority
https://calendly.com/your-calendly/45min-strategy
https://calendly.com/your-calendly/30min-consultation
https://calendly.com/your-calendly/60min-deep-dive
https://calendly.com/your-calendly/20min-guidance
https://calendly.com/your-calendly/45min-assessment
https://calendly.com/your-calendly/friday-workshop
```

**Replace with your actual Calendly links:**
```
https://calendly.com/viresh-skillaipath/priority-call
https://calendly.com/viresh-skillaipath/strategy-session
# etc.
```

---

## 🌐 **Netlify Deployment**

### **Option A: Drag & Drop (Easiest)**

1. **Go to Netlify:**
   - Visit [netlify.com](https://netlify.com)
   - Sign up/login with GitHub, Google, or email

2. **Deploy:**
   - Click "Add new site" → "Deploy manually"
   - Drag your entire `skill-ai-path` folder to the deployment area
   - Wait for deployment (30-60 seconds)

3. **Get Your URL:**
   - Netlify gives you a URL like: `https://amazing-tesla-123456.netlify.app`
   - Click "Site settings" → "Change site name" to customize

### **Option B: Git Deployment (Recommended)**

1. **Create GitHub Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial deployment"
   git branch -M main
   git remote add origin https://github.com/yourusername/skill-ai-path.git
   git push -u origin main
   ```

2. **Connect to Netlify:**
   - Click "Add new site" → "Import from Git"
   - Choose GitHub and select your repository
   - Deploy settings:
     - **Build command:** (leave empty)
     - **Publish directory:** (leave empty or put ".")
   - Click "Deploy site"

---

## ⚙️ **Post-Deployment Configuration**

### **Step 1: Set Environment Variables**
In Netlify dashboard → Site settings → Environment variables:

```
FORM_WEBHOOK_URL = https://hooks.zapier.com/hooks/catch/YOUR-WEBHOOK-ID
GOOGLE_ANALYTICS_ID = GA_MEASUREMENT_ID (optional)
FACEBOOK_PIXEL_ID = YOUR_PIXEL_ID (optional)
```

### **Step 2: Test Form Submissions**
1. Go to your live site
2. Fill out the form with test data
3. Check Netlify dashboard → Forms to see submissions
4. Verify redirects work correctly

### **Step 3: Set Up Analytics (Optional)**
Add to your `index.html` before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>

<!-- Facebook Pixel -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

---

## 🔄 **How the Automation Works**

### **Complete User Journey:**

1. **User visits** → `yoursite.netlify.app`
2. **Fills form** → JavaScript validates client-side
3. **Form submits** → Netlify function `process-lead.js` runs
4. **Function calculates** → Student priority score (0-100)
5. **Function determines** → Tier (Priority/Standard/Basic/General)
6. **Function redirects** → Appropriate booking page
7. **User books call** → Calendly integration
8. **Confirmation page** → Sets expectations
9. **Data stored** → Netlify Forms dashboard
10. **Webhooks fire** → External CRM integration (optional)

### **Tier Assignment Logic:**
- **85+ score** → Priority (exclusive treatment)
- **65-84 score** → Standard (professional approach)  
- **45-64 score** → Basic (supportive guidance)
- **<45 score** → General (free workshop)

---

## 🧪 **Testing Your Deployment**

### **Test Each Tier:**

**Priority Test (85+ score):**
```
Current Status: College Student
Interest: Complete Stack (All 6 Tracks)
Previous Courses: Paid courses (didn't complete)
Challenge: 200+ character detailed response
Email: student@university.edu
```

**Standard Test (65-84 score):**
```
Current Status: Recent Graduate (0-2 years)
Interest: Data Analytics Track
Previous Courses: Completed other courses
Challenge: 100+ character response
Email: graduate@gmail.com
```

**Basic Test (45-64 score):**
```
Current Status: Looking for Career Change
Interest: Not Sure / Need Guidance
Previous Courses: Only free courses
Challenge: 50+ character response
Email: career@email.com
```

**General Test (<45 score):**
```
Current Status: Senior Professional (5+ years)
Interest: Not Sure / Need Guidance
Previous Courses: No, this is my first
Challenge: 20 character response
Email: senior@company.com
```

---

## 📊 **Monitoring & Analytics**

### **Netlify Dashboard:**
- **Forms:** See all submissions and data
- **Functions:** Monitor lead processing performance
- **Analytics:** Traffic and conversion metrics
- **Deploy:** Track successful deployments

### **Key Metrics to Track:**
- **Conversion Rate:** Form submissions / visitors
- **Tier Distribution:** How leads are classified
- **Booking Rate:** Calls booked / tier redirects
- **Score Analysis:** Average qualification scores

---

## 🔧 **Troubleshooting Common Issues**

### **Forms Not Submitting:**
- Check `data-netlify="true"` attribute exists
- Verify `name` attributes match exactly
- Ensure `_redirects` file is in root directory

### **Redirects Not Working:**
- Check `netlify.toml` syntax
- Verify folder structure matches exactly
- Test function in Netlify Functions tab

### **Function Errors:**
- Check Netlify Functions logs
- Verify environment variables are set
- Test with simple form data first

---

## 🎯 **Success Checklist**

- [ ] All 13 files uploaded correctly
- [ ] Calendly URLs updated with your links
- [ ] Test form submission works
- [ ] All 4 tier redirects functional
- [ ] Confirmation pages load properly
- [ ] Instructor photo displays (or shows initials)
- [ ] Mobile responsiveness verified
- [ ] Analytics tracking setup (optional)
- [ ] Webhook integration configured (optional)

---

## 🚀 **You're Live!**

Once deployed, your complete lead qualification and booking system will be fully automated. Students get tier-appropriate experiences, and you get qualified leads with complete data for follow-up.

**Need help?** Check Netlify's support docs or the function logs for debugging.

**Ready to scale?** Add more tracking, A/B testing, or integrate with your CRM system using the webhook functionality.