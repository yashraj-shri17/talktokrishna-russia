# Production Deployment Guide: TTK Japan

Follow these steps to ensure the payment system works correctly on Render and Vercel.

## 1. Backend: Render Setup
Go to your **Render Dashboard** for the `talk-to-krishna-api` service.

### Environment Variables
Under the **Environment** tab, ensure these keys are added:
- `DATABASE_URL`: Your Neon PostgreSQL connection string.
- `GROQ_API_KEY`: Your Groq API key.
- `RAZORPAY_KEY_ID`: Your Razorpay Key ID.
- `RAZORPAY_KEY_SECRET`: Your Razorpay Key Secret.
- `FRONTEND_URL`: `https://talk-to-krishna-japan.vercel.app,https://japan.talktokrishna.ai`

### Database Migration
The server will automatically try to create the `subscriptions` table on startup. 
If it fails, you can run the migration manually via the Render Shell:
```bash
python migrate_db.py
```

---

## 2. Frontend: Vercel Setup
Go to your **Vercel Dashboard** for the `talk-to-krishna-japan` project.

### Environment Variables
Under **Settings > Environment Variables**, add:
- `REACT_APP_API_URL`: `https://talk-to-krishna-api.onrender.com` (Or your actual Render service URL)

### Deployment
Redeploy the project so Vercel can bake these variables into the production build.

---

## 3. Razorpay Dashboard
1. Log in to [Razorpay](https://dashboard.razorpay.com/).
2. Go to **Settings > Payment Methods**.
3. Ensure **International Payments** is **Enabled**.
4. (Optional) Link a **PayPal** account to provide Japanese users with a non-card option.

---

## ✅ Integration Check
Once deployed, verify:
1. Navigating to the Pricing page shows the 14,999 / 23,999 JPY plans.
2. Clicking "Pay" opens the Razorpay modal with "TTK Japan" branding.
3. Metadata in Razorpay dashboard shows:
   - `Platform: TTK Japan`
   - `Plan Type: Basic / Premium`
   - `User Email: ...`
