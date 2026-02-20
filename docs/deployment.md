# Deployment Guide

This document explains how to set up and use the deployment workflows for the CASN project.

## Quick Start

After fixing the deployment issues, deployments should now work automatically when pushing to the `main` branch.

### Current Status: Deployments Fixed

**What was broken:**

- Port configuration mismatch between Docker and docker-compose
- Missing deployment workflow (old Symfony workflow removed)
- No automated deployment triggers

**What was fixed:**

- Port configuration: Both docker-compose files now use PORT=3000
- Deployment workflow: Created `.github/workflows/deploy.yml`
- Docker workflow: Updated to trigger on feature branches for testing
- Documentation: Complete deployment guide created

## Overview

The project uses GitHub Actions for automated deployments with the following workflows:

- **Docker Build and Push** (`.github/workflows/docker.yml`): Builds and pushes Docker images to GitHub Container Registry
- **Deploy to Production** (`.github/workflows/deploy.yml`): Deploys the application to production servers
- **Create Release** (`.github/workflows/release.yml`): Creates GitHub releases with changelogs and assets

## Prerequisites

### Required Secrets

Set up the following secrets in your GitHub repository settings:

#### For SSH Deployment (Recommended)

```text
DEPLOY_HOST        # Server hostname/IP
DEPLOY_USER        # SSH username
DEPLOY_KEY         # Private SSH key (generate with: ssh-keygen -t rsa -b 4096)
DEPLOY_PORT        # SSH port (optional, defaults to 22)
DEPLOY_PATH        # Path to application on server (optional, defaults to /opt/casn)
HEALTH_CHECK_URL   # URL to check after deployment (optional)
```

#### For Portainer API Deployment

```text
PORTAINER_URL      # Portainer API URL
PORTAINER_WEBHOOK_ID # Portainer webhook ID for stack updates
```

## Deployment Methods

### 1. SSH Deployment (Recommended)

This method connects directly to your production server via SSH and runs deployment commands.

**Setup:**

1. Generate SSH key pair on your local machine:

   ```bash
   ssh-keygen -t rsa -b 4096 -C "github-deploy@yourdomain.com"
   ```

2. Add the public key to your server's `~/.ssh/authorized_keys`

3. Add the private key as `DEPLOY_KEY` secret in GitHub

4. Ensure the deployment user has Docker permissions on the server

### 2. Portainer Webhook Deployment

If you're using Portainer, you can trigger deployments via webhooks.

**Setup:**

1. Create a webhook in Portainer for your stack
2. Add the webhook URL as `PORTAINER_URL` secret
3. The workflow will POST to this URL to trigger deployment

### 3. Manual Deployment

If no automated deployment is configured, the workflow will output deployment instructions.

## Workflow Triggers

### Docker Build

- **Push to main branch**: Builds and tags as `main`
- **Push to feature branches**: Builds and tags with branch name
- **Push tags**: Builds with semantic version tags
- **Pull requests**: Builds for testing

### Production Deployment

- **Push to main branch**: Automatically deploys to production
- **Manual trigger**: Can be triggered manually via GitHub UI

### Release Creation

- **Push version tags**: Creates GitHub releases with changelogs (e.g., `git tag v1.2.3 && git push origin v1.2.3`)

## Creating Releases

### Automatic Release Creation

When you push a version tag (like `v1.2.3`), the release workflow automatically:

1. **Generates a changelog** from git commits since the last release
2. **Creates a GitHub release** with:
   - Release notes with changes
   - Docker image pull instructions
   - Build information and metadata
3. **Uploads release assets** (version info, build details)

### How to Create a Release

**Easy way (recommended):**

```bash
# Use the provided script
./scripts/create-release.sh v1.2.3 "Add new features"

# Or without custom message
./scripts/create-release.sh v1.2.3
```

**Manual way:**

```bash
# Create and push a version tag
git tag v1.2.3
git push origin v1.2.3

# Or create an annotated tag with message
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

The script will validate your environment and guide you through the process safely.

### Tag Naming Convention

- **Stable releases**: `v1.2.3`, `v2.0.0`
- **Pre-releases**: `v1.2.3-beta.1`, `v2.0.0-rc.1`, `v1.3.0-alpha.2`

Pre-release tags automatically create draft releases.

### Release Workflow Features

- **Automatic changelog generation** from git commits
- **Docker image references** in release notes
- **Build artifacts** with version information
- **Deployment status** tracking
- **Pre-release detection** for beta/alpha/rc versions

## Environment Configuration

### Production Environment Variables

Create environment variables in your deployment target:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/casn_prod"

# Next.js
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="your-secret-key"

# Other app-specific variables...
```

### Docker Compose Configuration

The production deployment uses `docker-compose.portainer.yml` which should contain:

- Correct port mappings (currently set to 80:3000)
- Environment variables
- Volume mounts for persistent data
- Network configuration

## Health Checks

The deployment workflow includes optional health checks that will:

1. Wait for the application to respond
2. Retry up to 30 times with 10-second intervals
3. Fail the deployment if health check fails

Configure with `HEALTH_CHECK_URL` secret pointing to your application's health endpoint.

## Troubleshooting

### Common Issues

1. **SSH Connection Failed**
   - Check `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_KEY` secrets
   - Ensure SSH key is added to server's authorized_keys
   - Verify firewall allows SSH connections

2. **Docker Permission Denied**
   - Ensure deployment user is in docker group: `sudo usermod -aG docker $USER`
   - Or run deployment commands with sudo

3. **Port Already in Use**
   - Check if another service is using port 80
   - Verify docker-compose configuration

4. **Health Check Failed**
   - Check `HEALTH_CHECK_URL` is accessible
   - Verify application started correctly
   - Check application logs: `docker-compose logs`

### Viewing Logs

```bash
# View deployment logs
docker-compose -f docker-compose.portainer.yml logs -f

# View specific service logs
docker-compose -f docker-compose.portainer.yml logs app
```

### Manual Deployment

If automated deployment fails, you can deploy manually:

```bash
# On production server
cd /path/to/casn
git pull origin main
docker pull ghcr.io/yourusername/casn:main
docker-compose -f docker-compose.portainer.yml down
docker-compose -f docker-compose.portainer.yml up -d
```
