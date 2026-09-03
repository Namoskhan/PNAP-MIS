# Deploying PNAP-MIS on Render

This guide outlines how to deploy the PNAP-MIS web application (Express API + Vite React SPA in a single container) on [Render](https://render.com) for a live demo.

---

## Prerequisites
1. A **Render** account ([render.com](https://render.com)).
2. A **MongoDB** database:
   - Recommended for production/demo: Free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster.
   - Obtain connection string: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/pnap_mis?retryWrites=true&w=majority`

---

## Method 1: 1-Click Deployment via Render Blueprint (Recommended)

Render Blueprints use the [`render.yaml`](./render.yaml) file already configured in this repository.

1. **Push your code** to GitHub:
   ```bash
   git add .
   git commit -m "ready for render deployment"
   git push origin main
   ```
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically discover `render.yaml` and configure:
   - **Service Type**: Web Service
   - **Runtime**: Docker (`./Dockerfile`)
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: Enabled on `main` branch push
5. Under Environment Variables:
   - Enter your `MONGO_URI` (from MongoDB Atlas).
   - Render will automatically generate a secure `JWT_SECRET` for you.
6. Click **Apply**. Your app will build and go live within a few minutes!

---

## Method 2: Manual Web Service Deployment on Render

If you prefer to configure the Web Service manually:

1. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure the settings:
   - **Name**: `pnap-mis`
   - **Region**: Choose the closest region (e.g. Frankfurt, Oregon, Singapore)
   - **Branch**: `main` (or your active branch)
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: `Free` (or `Starter`)
4. Expand **Advanced** and set:
   - **Health Check Path**: `/health`
5. Under **Environment Variables**, add:
   | Key | Value | Notes |
   |-----|-------|-------|
   | `NODE_ENV` | `production` | Production mode |
   | `MONGO_URI` | `mongodb+srv://...` | Your MongoDB Atlas connection URI |
   | `JWT_SECRET` | *(Random 32+ char string)* | Secure secret key for auth tokens |
   | `JWT_EXPIRES_IN` | `12h` | Session lifetime |
   | `CORS_ORIGIN` | `*` | Allowed origins |
   | `CLIENT_ORIGIN` | `*` | Allowed client origins |
   | `UPLOAD_DIR` | `uploads` | Writable uploads directory in container |
   | `MAX_UPLOAD_MB` | `5` | Max upload size |
6. Click **Create Web Service**.

---

## Method 3: Local Testing with Docker Compose

Before deploying to Render, you can test the production container locally with Docker Compose:

```bash
# Build and start both the application and local MongoDB container
docker compose up --build

# Run in detached background mode
docker compose up -d --build

# Stop the containers
docker compose down
```

The application will be accessible at `http://localhost:5000` (or the port defined by `HOST_PORT` in your `.env`).

---

## GitHub Actions CI/CD Pipeline

The repository includes a GitHub Actions workflow at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).

### What it does:
1. **Validate & Build**: Tests dependencies and verifies that Vite compiles `web/dist` cleanly on every push and PR.
2. **Docker Check**: Verifies that the multi-stage `Dockerfile` builds and runs cleanly.
3. **Deploy Trigger**: Automatically triggers a Render redeploy on every push to `main`.

### Enabling the Auto-Deploy Hook (Optional):
1. In Render, open your Web Service → **Settings**.
2. Scroll to **Deploy Hook** and copy the URL (e.g., `https://api.render.com/deploy/srv-xxxx?key=yyyy`).
3. In your GitHub repository, go to **Settings** → **Secrets and variables** → **Actions**.
4. Click **New repository secret**:
   - Name: `RENDER_DEPLOY_HOOK_URL`
   - Value: *(Paste your Render Deploy Hook URL)*
5. Future pushes to `main` will now automatically trigger Render deployment via GitHub Actions!
