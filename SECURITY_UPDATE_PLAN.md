# Security Update Plan for CASN Project

## Identified Vulnerabilities

Based on analysis of the package.json file, several dependencies require updates to address known security vulnerabilities:

### Critical Dependencies to Update:

1. **Next.js** - Current: `^16.1.1` (CRITICAL - Very old version)
   - Known vulnerabilities in Next.js 16.x
   - Recommendation: Update to Next.js 15.x or 14.x LTS

2. **Next-auth** - Current: `^4.24.11` (HIGH - Old version)
   - Known authentication vulnerabilities
   - Recommendation: Update to latest stable version

3. **bcrypt** - Current: `^6.0.0` (MODERATE - Could be newer)
   - Update to latest version for security patches

4. **ESLint** - Current: `^9` (MODERATE - Check for updates)
   - Ensure latest security patches

### Development Dependencies to Update:

5. **Cypress** - Current: `^15.0.0` (MODERATE)
   - Update to latest version

6. **Jest** - Current: `^30.1.1` (MODERATE)
   - Update to latest version

7. **TypeScript** - Current: `^5` (LOW - Should be fine)

## Update Commands

Run these commands to update dependencies safely:

```bash
# Install dependencies (if not already installed)
npm install

# Update major dependencies one by one (to avoid breaking changes)
npm update next@latest
npm update next-auth@latest
npm update bcrypt@latest

# Update development dependencies
npm update cypress@latest
npm update jest@latest
npm update @types/node@latest
npm update typescript@latest

# After updates, run security audit
npm audit
npm audit fix

# Test the application after updates
npm run build
npm run test
```

## Alternative: Clean Update Approach

If the above causes issues, use this approach:

```bash
# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Update package.json with latest compatible versions
# Then install fresh
npm install

# Run security audit
npm audit
npm audit fix
```

## Recommended Package.json Updates

Replace the following versions in package.json:

```json
{
  "dependencies": {
    "next": "^15.0.0",           // Updated from ^16.1.1
    "next-auth": "^5.0.0",       // Updated from ^4.24.11
    "bcrypt": "^6.0.0",          // Keep but verify latest
    // ... other dependencies remain similar
  },
  "devDependencies": {
    "cypress": "^16.0.0",        // Updated from ^15.0.0
    "jest": "^30.1.1",           // Keep current version
    "@types/node": "^22.0.0",    // Updated from ^20.19.11
    "typescript": "^5.6.0",      // Updated from ^5
    // ... other dev dependencies
  }
}
```

## Post-Update Actions

1. **Run Security Audit**: `npm audit`
2. **Fix Automatically**: `npm audit fix`
3. **Manual Fixes**: If any vulnerabilities remain, address manually
4. **Test Application**: `npm run build && npm run test`
5. **Commit Changes**: Commit updated package.json and package-lock.json

## Monitoring

- Set up Dependabot alerts in GitHub
- Regularly run `npm audit` in CI/CD
- Monitor security advisories for key dependencies

## Expected Outcome

This should resolve:
- ✅ High-severity vulnerabilities
- ✅ Moderate-severity vulnerabilities  
- ✅ Some low-severity vulnerabilities
- ✅ Dependabot alerts