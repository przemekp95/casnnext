# Docker Image Rebuild Solution

## Problem Identified

You're using the new `docker-compose.prepopulated.yml` file correctly, but the **Docker image** `ghcr.io/przemekp95/casnnext:main` was built **before** the syntax fixes were applied.

## Root Cause

- ✅ `docker-compose.prepopulated.yml` - Uses correct configuration
- ✅ `docker-init-db.sql` - Contains all data correctly
- ❌ **Docker image** - Still contains old broken `seed.ts` with syntax error

## Solution Options

### Option 1: Rebuild Docker Image (RECOMMENDED)

Build a new Docker image with all fixes applied:

```bash
# Build new image with fixes
docker build -t ghcr.io/przemekp95/casnnext:main .

# Push to GHCR (if you have access)
docker push ghcr.io/przemekp95/casnnext:main

# Deploy with pre-populated database
docker-compose -f docker-compose.prepopulated.yml up -d
```

### Option 2: Use Local Dockerfile (IMMEDIATE)

Create a temporary Dockerfile that includes the fixes:

```dockerfile
# Use base image
FROM ghcr.io/przemekp95/casnnext:main

# Override with fixed files
COPY ./app /app/app
COPY ./prisma/seed.ts /app/prisma/seed.ts

# Rebuild local image
docker build -t casn-app-local .
```

### Option 3: Manual Image Update (SIMPLE)

Copy fixed files into running container:

```bash
# Copy fixed seed.ts to container
docker cp ./prisma/seed.ts casn-app:/app/prisma/seed.ts

# Restart container
docker restart casn-app
```

## Quick Fix Commands

```bash
# Option 3 - Copy fixed seed.ts
docker cp prisma/seed.ts casn-app:/app/prisma/seed.ts
docker restart casn-app

# Wait for restart
sleep 30

# Verify it works
curl http://localhost:3001/api/articles
```

## Verification

After any solution:
```bash
# Check no syntax errors in logs
docker logs casn-app | grep -i "syntax\|error"

# Test API
curl http://localhost:3001/api/articles

# Check database
docker exec casn-mysql mysql -u casn_user -pcasn_password123 casn -e "SELECT COUNT(*) FROM Author;"
```

## Recommended Next Steps

1. **Quick fix**: Copy fixed `seed.ts` to container
2. **Proper fix**: Rebuild Docker image
3. **Permanent fix**: Deploy new image to GHCR

The quickest solution is Option 3 - copy the fixed seed.ts file to the running container.