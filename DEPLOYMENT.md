# ============================================================
# Production Deployment Checklist
# ============================================================

## Pre-Deployment

- [ ] All environment variables configured in hosting platform
- [ ] DATABASE_URL points to production PostgreSQL instance
- [ ] Database migrations run: `npm run db:migrate`
- [ ] Database backups configured (daily minimum)
- [ ] NYC_OPEN_DATA_APP_TOKEN configured (avoid rate limits)
- [ ] PLAYWRIGHT_HEADLESS=true for production
- [ ] Rate limits configured appropriately (RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)

## Security

- [ ] All secrets stored in secrets manager (not .env files)
- [ ] SSL/TLS certificates configured
- [ ] CORS configured if needed
- [ ] Security headers enabled (via middleware.ts)
- [ ] Database uses SSL connections in production
- [ ] No sensitive data in logs
- [ ] robots.txt configured
- [ ] .env files in .gitignore and NOT committed

## Monitoring & Logging

- [ ] Application monitoring configured (Sentry, DataDog, New Relic)
- [ ] Log aggregation configured (CloudWatch, Splunk, etc.)
- [ ] Health check endpoint tested: /api/health
- [ ] Uptime monitoring configured (Pingdom, UptimeRobot)
- [ ] Error alerting configured
- [ ] Database query performance monitoring

## Performance

- [ ] Database connection pool sized appropriately
- [ ] Rate limiter upgraded to Redis or database-backed solution
- [ ] CDN configured for static assets
- [ ] Image optimization enabled
- [ ] Database indexes verified
- [ ] API response caching strategy implemented

## Infrastructure

- [ ] Horizontal scaling configured (multiple instances)
- [ ] Load balancer health checks use /api/health
- [ ] Auto-scaling rules configured
- [ ] Graceful shutdown handling implemented
- [ ] Database failover tested
- [ ] Backup restore tested

## Testing

- [ ] All unit tests passing: `npm test`
- [ ] Integration tests passing: `npm run test:integration`
- [ ] Load testing completed
- [ ] Playwright browser installed on production server
- [ ] End-to-end testing in staging environment

## Documentation

- [ ] README updated with production deployment steps
- [ ] API documentation current
- [ ] Runbook created for common issues
- [ ] Database schema documented
- [ ] Environment variables documented

## Compliance & Legal

- [ ] Data retention policy implemented
- [ ] Privacy policy created (if collecting user data)
- [ ] Terms of service created
- [ ] GDPR compliance reviewed (if applicable)
- [ ] Accessibility standards reviewed (WCAG)

## Post-Deployment

- [ ] Smoke tests completed
- [ ] Health check returning 200 OK
- [ ] Search functionality verified
- [ ] Export functionality tested
- [ ] Database writes confirmed
- [ ] Error tracking receiving events
- [ ] Metrics dashboard reviewed
- [ ] On-call rotation established
- [ ] Incident response plan documented

## Known Limitations (Document & Monitor)

- [ ] In-memory rate limiter won't work with multiple instances (needs Redis)
- [ ] Playwright scraper is fragile and may break with DOB UI changes
- [ ] No circuit breaker for external API failures
- [ ] No request queuing for heavy load
