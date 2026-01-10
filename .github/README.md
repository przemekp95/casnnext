# GitHub Actions Templates & Reusable Components

This directory contains reusable workflow templates and composite actions to standardize and optimize CI/CD processes across the CASN project.

## 📁 Directory Structure

```
.github/
├── actions/                    # Reusable composite actions
│   ├── checkout-and-setup/     # Standardized checkout + environment setup
│   ├── docker-login/          # Container registry authentication
│   ├── health-check/          # Application health verification
│   └── generate-changelog/    # Automatic changelog generation
├── workflow-templates/        # Reusable workflow templates
│   └── docker-build.yml       # Standardized Docker build workflow
└── workflows/                 # Actual workflow implementations
    ├── docker.yml            # Uses docker-build template
    ├── deploy.yml            # Production deployment
    └── release.yml           # Release creation
```

## 🔧 Reusable Actions

### `checkout-and-setup`
**Purpose:** Standardized repository checkout with common environment setup

**Usage:**
```yaml
- uses: ./.github/actions/checkout-and-setup
  with:
    fetch-depth: 0  # Optional: default 1
```

**Outputs:**
- `registry`: Container registry URL (ghcr.io)
- `image-name`: Full image name with registry
- `repository`: Repository name

### `docker-login`
**Purpose:** Authenticate with container registries

**Usage:**
```yaml
- uses: ./.github/actions/docker-login
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ github.token }}
```

### `health-check`
**Purpose:** Verify application health after deployment

**Usage:**
```yaml
- uses: ./.github/actions/health-check
  with:
    url: https://your-app.com/health
    timeout: 300    # Optional: default 300s
    interval: 10    # Optional: default 10s
```

### `generate-changelog`
**Purpose:** Generate changelogs from git commits

**Usage:**
```yaml
- uses: ./.github/actions/generate-changelog
  id: changelog
  with:
    since-tag: v1.0.0  # Optional: auto-detect latest tag
```

**Outputs:**
- `changelog`: Formatted changelog content

## 📋 Workflow Templates

### `docker-build.yml`
**Purpose:** Standardized Docker build and push workflow

**Inputs:**
- `registry`: Container registry URL
- `image-name`: Image name (without registry)
- `dockerfile`: Path to Dockerfile
- `context`: Build context
- `tags`: Image tagging strategy

**Usage:**
```yaml
jobs:
  build:
    uses: ./.github/workflow-templates/docker-build.yml
    with:
      registry: ghcr.io
      image-name: ${{ github.repository }}
```

## 🚀 Benefits of This Architecture

### 1. **DRY Principle (Don't Repeat Yourself)**
- Common setup steps are centralized
- Environment variables are standardized
- Authentication patterns are consistent

### 2. **Maintainability**
- Changes to common logic only need to be made in one place
- Easier to update action versions across workflows
- Centralized configuration management

### 3. **Consistency**
- All workflows follow the same patterns
- Standardized naming conventions
- Consistent error handling and logging

### 4. **Reusability**
- Actions can be used across multiple workflows
- Templates can be extended for different use cases
- Easy to create new workflows from existing components

### 5. **Testing & Debugging**
- Isolated components can be tested individually
- Easier to debug complex workflows
- Better separation of concerns

## 🔄 Migration Guide

### Before (Traditional Workflow)
```yaml
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: echo "REGISTRY=ghcr.io" >> $GITHUB_ENV
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          # ...
```

### After (Using Templates)
```yaml
jobs:
  build:
    uses: ./.github/workflow-templates/docker-build.yml
    with:
      registry: ghcr.io
      # ...
```

## 🛠️ Development Guidelines

### Creating New Actions
1. Create directory under `.github/actions/`
2. Add `action.yml` with metadata and implementation
3. Test action in isolation
4. Document usage in this README

### Creating New Templates
1. Create `.yml` file under `.github/workflow-templates/`
2. Use `workflow_call` trigger with inputs
3. Include comprehensive documentation
4. Test template with different parameter combinations

### Naming Conventions
- **Actions:** lowercase-with-hyphens
- **Templates:** descriptive-name.yml
- **Inputs/Outputs:** camelCase
- **Environment Variables:** UPPER_CASE

## 📊 Performance Optimizations

### Caching Strategy
- Docker layer caching through buildx
- Node.js dependency caching
- Registry pull-through caching

### Parallel Execution
- Independent jobs run in parallel
- Matrix builds for multi-environment testing
- Conditional execution to skip unnecessary steps

### Resource Optimization
- Appropriate runner sizes (ubuntu-latest vs. larger)
- Step-level `if` conditions to skip irrelevant work
- Efficient artifact management

## 🔒 Security Considerations

### Secret Management
- Use GitHub secrets for sensitive data
- Never hardcode credentials in workflows
- Rotate secrets regularly

### Permission Scoping
- Use minimal required permissions
- Separate read/write permissions appropriately
- Use environment protection rules

### Dependency Scanning
- Regular security updates for actions
- Pin action versions to specific SHAs when possible
- Monitor for deprecated actions

## 📈 Monitoring & Analytics

### Workflow Analytics
- Track workflow run times and success rates
- Monitor resource usage and costs
- Identify bottlenecks and optimization opportunities

### Error Tracking
- Centralized error logging
- Automated failure notifications
- Retry mechanisms for transient failures

---

## 🎯 Quick Reference

**Add to new workflow:**
```yaml
- uses: ./.github/actions/checkout-and-setup
- uses: ./.github/actions/health-check
  with:
    url: ${{ secrets.HEALTH_CHECK_URL }}
```

**Use template:**
```yaml
jobs:
  build:
    uses: ./.github/workflow-templates/docker-build.yml
```

**Common environment variables:**
```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}