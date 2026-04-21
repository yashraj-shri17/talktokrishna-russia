# 🕉️ Talk to Krishna - Full Deployment Guide

This guide provides a detailed, step-by-step walkthrough to deploy the **Talk to Krishna** application. We use a professional decoupled architecture:
- **Backend (Python API):** Deployed on **Render** (Free Tier).
- **Frontend (React Web App):** Deployed on **Vercel** (Free Tier).

---

## 🏗️ Phase 1: Prepare and Push to GitHub

1. Ensure your local code is committed and pushed to your GitHub repository.
   ```powershell
   git add .
   git commit -m "Prepare for deployment"
   git push -u origin main
   ```
2. Note your GitHub repository URL (e.g., `https://github.com/yashraj-shri17/talk-to-krishna-japan`).

---

## 🔙 Phase 2: Deploy the Backend (Render)

The backend handles AI logic, database storage, and speech synthesis.

1. **Sign Up/Log In:** Go to [Render](https://render.com/).
2. **Create New Service:** 
   - Click **New +** -> **Web Service**.
   - Select **Build and deploy from a Git repository**.
   - Connect your GitHub account and find `talk-to-krishna-japan`.
3. **Configure Settings:**
   - **Name:** `talk-to-krishna-api`
   - **Environment:** `Python`
   - **Region:** `Oregon (us-west-2)` (Recommended for free tier).
   - **Branch:** `main`
   - **Build Command:** `pip install -r requirements.txt && python -m src.create_embeddings`
   - **Start Command:** `gunicorn website.api_server:app --workers 1 --threads 4 --timeout 180 --preload`
4. **Environment Variables:**
   - Click **Advanced** -> **Add Environment Variable**:
     - `PYTHON_VERSION`: `3.10.12` (Critical for compatibility).
     - `GROQ_API_KEY`: *(Paste your Groq API Key starting with `gsk_`)*.
     - `FRONTEND_URL`: **Keep this blank for now.** We will fill it after Phase 3.
5. **Persistent Disk (For your Database):**
   - Under the **Disk** section, click **Add Disk**:
     - **Name:** `data-disk`
     - **Mount Path:** `/data`
     - **Size:** `1 GB`
   - Add another Environment Variable for the database:
     - `DB_PATH`: `/data/users.db`
6. **Click Create Web Service.**
   - Wait ~5 minutes. Render will install dependencies and generate AI embeddings.
7. **Get your API URL:** Once status is **Live**, copy your URL (e.g., `https://talk-to-krishna-api-xxxx.onrender.com`).

---

## 🌅 Phase 3: Deploy the Frontend (Vercel)

The frontend is the user interface where people talk to Krishna.

1. **Sign Up/Log In:** Go to [Vercel](https://vercel.com/new).
2. **Import Project:** Select your GitHub repository.
3. **Configure Project:**
   - **Framework Preset:** `Create React App` (Auto-detected).
   - **Root Directory:** Edit and select `website/krishna-react`.
4. **Environment Variables:**
   - Add the following variable:
     - **Name:** `REACT_APP_API_URL`
     - **Value:** *(Paste your Render API URL from Phase 2)*. **Important: No trailing slash!**
5. **Click Deploy.**
   - Wait ~1 minute. 
6. **Get your App URL:** Once finished, copy your Production Domain (e.g., `https://talk-to-krishna.vercel.app`).

---

## 🤝 Phase 4: The Final Handshake (CORS Fix)

To allow the Frontend to talk to the Backend, you must tell the Backend that the Frontend is "safe".

1. Go back to your **Render Dashboard**.
2. Select your `talk-to-krishna-api` service.
3. Navigate to **Environment**.
4. Edit the `FRONTEND_URL` variable:
   - **Value:** *(Paste your Vercel App URL from Phase 3)*.
5. **Save Changes.** Render will restart with safety checks enabled.

---

## ✅ Phase 5: Verification

1. Open your Vercel App URL in your browser.
2. Try asking Krishna a question (e.g., "Krishna, how do I find peace?").
3. Verify that the response appears and audio plays.

**Congratulations! Your application is live!** 🚀
