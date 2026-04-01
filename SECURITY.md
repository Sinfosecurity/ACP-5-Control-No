# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer(s) directly with details
3. Include steps to reproduce, impact assessment, and suggested fixes if possible

We will respond within 48 hours and work with you to address the issue.

## Security Best Practices

### Environment Variables & Secrets

- **NEVER** commit `.env`, `.env.local`, or any file containing secrets
- Use secrets managers in production (AWS Secrets Manager, HashiCorp Vault, etc.)
- Rotate database credentials regularly
- Use strong, unique passwords for all services

### Database Security

- Always use SSL/TLS for database connections in production
- Enable row-level security (RLS) if using Supabase
- Regularly backup database and test restore procedures
- Use connection pooling to prevent exhaustion attacks
- Monitor for unusual query patterns

### API Security

- Rate limiting is enabled (20 requests/minute default)
- Input validation using Zod schemas
- Parameterized SQL queries to prevent injection
- CORS configured appropriately for your domain
- Security headers configured in middleware

### Playwright Scraping

- Runs in headless mode in production
- No user-controlled URLs (only configured DOB portal)
- Screenshots saved to temporary directory (excluded from version control)
- Timeouts configured to prevent hanging

### Dependencies

- Run `npm audit` regularly to check for vulnerabilities
- Keep dependencies up to date with security patches
- Review dependency licenses for compliance
- Use `npm ci` for reproducible builds

### Production Checklist

- [ ] All environment variables configured in secrets manager
- [ ] Database uses SSL connections
- [ ] Security headers enabled
- [ ] Rate limiting working correctly
- [ ] Health check endpoint accessible
- [ ] Error messages don't leak sensitive information
- [ ] Logging doesn't contain secrets or PII
- [ ] HTTPS/TLS certificates configured and auto-renewing
- [ ] Automated backups enabled and tested

### Known Security Limitations

1. **In-memory rate limiter**: Current implementation won't work across multiple instances
   - **Mitigation**: Upgrade to Redis-backed rate limiter for production
   
2. **IP-based rate limiting**: Can be bypassed with VPNs or proxy rotation
   - **Mitigation**: Consider additional rate limiting by API key or authentication

3. **No authentication**: API is publicly accessible
   - **Consideration**: Add API keys or OAuth if needed for your use case

4. **Playwright dependencies**: Large attack surface for browser automation
   - **Mitigation**: Run in isolated container, keep updated, monitor for CVEs

## Security Headers

The following security headers are configured in [src/middleware.ts](src/middleware.ts):

- `Strict-Transport-Security`: Enforce HTTPS
- `X-Frame-Options`: Prevent clickjacking
- `X-Content-Type-Options`: Prevent MIME sniffing
- `X-XSS-Protection`: Enable browser XSS protection
- `Content-Security-Policy`: Restrict resource loading
- `Referrer-Policy`: Control referrer information
- `Permissions-Policy`: Disable unnecessary browser features

## Compliance Considerations

### Data Privacy

- Search queries and results are stored in the database
- IP addresses are collected for rate limiting
- User agents are logged
- Consider GDPR/CCPA requirements if collecting personal data
- Implement data retention policies

### Terms of Use

- Respect NYC Open Data terms of service
- Review DOB NOW Public Portal terms before scraping
- Rate limit appropriately to avoid overwhelming public APIs
- Consider implementing terms of service for your application

## Incident Response

If a security incident occurs:

1. **Assess**: Determine scope and severity
2. **Contain**: Isolate affected systems
3. **Investigate**: Collect logs and evidence
4. **Remediate**: Apply fixes and patches
5. **Communicate**: Notify affected users if necessary
6. **Learn**: Document and update security practices

## Security Contacts

- Maintainer: [Your Contact Information]
- Security Team: [Security Team Email]

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Change Log

- 2026-03-30: Initial security policy created
