# Production Deployment Guide

This guide covers deploying the NYC DOB Filing Lookup application to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
- [Docker Deployment](#docker-deployment)
- [Vercel Deployment](#vercel-deployment)
- [AWS Deployment](#aws-deployment)
- [Post-Deployment](#post-deployment)

## Prerequisites

Before deploying to production:

1. **Environment Setup**: Configure all required environment variables
2. **Database**: PostgreSQL 14+ instance ready (Supabase, AWS RDS, etc.)
3. **Secrets Management**: Use proper secrets manager (not .env files)
4. **Monitoring**: Set up application monitoring (Sentry, DataDog, etc.)
5. **Backups**: Configure automated database backups

## Deployment Options

### Option 1: Docker (Recommended)

Best for self-hosted deployments with full control.

```bash
# 1. Build Docker image
docker build -t nyc-dob-lookup .

# 2. Run with environment variables
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e NYC_OPEN_DATA_APP_TOKEN="..." \
  -e PLAYWRIGHT_HEADLESS=true \
  -e NODE_ENV=production \
  --name nyc-dob-app \
  nyc-dob-lookup

# 3. Check health
curl http://localhost:3000/api/health
```

### Option 2: Docker Compose

Includes PostgreSQL and Redis for complete stack.

```bash
# 1. Set environment variables
export NYC_OPEN_DATA_APP_TOKEN="your_token"

# 2. Start all services
docker-compose up -d

# 3. View logs
docker-compose logs -f app

# 4. Stop services
docker-compose down
```

### Option 3: Vercel (Serverless)

Quick deployment for serverless hosting.

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel --prod

# 4. Configure environment variables in Vercel dashboard
# - DATABASE_URL
# - NYC_OPEN_DATA_APP_TOKEN
# - PLAYWRIGHT_HEADLESS=true
```

**Note**: Playwright may have issues in Vercel's serverless environment. Consider disabling live verification or using AWS Lambda with container support.

### Option 4: AWS (ECS/Fargate)

Production-grade deployment with auto-scaling.

See [AWS_DEPLOYMENT.md](./docs/AWS_DEPLOYMENT.md) for detailed instructions.

## Environment Variables

Production environment variables (use secrets manager):

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Optional but recommended
NYC_OPEN_DATA_APP_TOKEN=your_token_here

# Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
PLAYWRIGHT_SCREENSHOT_DIR=/tmp/screenshots

# Rate Limiting (adjust for production)
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Application
NODE_ENV=production
NEXT_PUBLIC_APP_NAME="NYC DOB Filing Lookup"
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

## Database Setup

### 1. Create Production Database

**Option A: Supabase** (Managed PostgreSQL)
```bash
# 1. Create project at https://supabase.com
# 2. Get connection string from Settings > Database
# 3. Run migrations via SQL editor
```

**Option B: AWS RDS**
```bash
# 1. Create RDS PostgreSQL instance
# 2. Configure security groups
# 3. Enable SSL
# 4. Run migrations
```

### 2. Run Migrations

```bash
# Local migration
DATABASE_URL="postgresql://..." npm run db:migrate

# Or via Docker
docker exec nyc-dob-app node scripts/migrate.js
```

### 3. Verify Database

```bash
# Connect to database
psql "$DATABASE_URL"

# Verify tables
\dt

# Expected tables:
# - properties
# - searches
# - filings
# - search_filings
# - source_logs
# - acp7_records
# - job_compliance
```

## Security Hardening

### 1. Enable SSL for Database

```javascript
// In src/lib/db.ts
ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: true, ca: fs.readFileSync('/path/to/ca-cert.pem') }
  : false
```

### 2. Configure Rate Limiting

For production with multiple instances, use Redis:

```bash
# Add to docker-compose.yml or use managed Redis
REDIS_URL=redis://your-redis-host:6379
```

Then update [src/lib/rate-limiter.ts](src/lib/rate-limiter.ts) to use Redis.

### 3. Set Up Monitoring

**Sentry** (Error Tracking)
```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

**DataDog** (APM)
```bash
npm install dd-trace
# Add to next.config.js
```

## Health Checks & Monitoring

### Health Check Endpoint

```bash
# Check application health
curl https://yourdomain.com/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-03-30T...",
  "uptime": 12345.67,
  "checks": {
    "database": {
      "status": "up",
      "latencyMs": 15
    }
  }
}
```

### Configure Load Balancer

Point health checks to `/api/health`:
- Healthy: HTTP 200
- Unhealthy: HTTP 503
- Interval: 30 seconds
- Timeout: 10 seconds
- Unhealthy threshold: 3 failures

## Performance Optimization

### 1. Enable CDN

Configure CDN for static assets:
- CloudFront (AWS)
- Cloudflare
- Vercel Edge Network

### 2. Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_searches_created_desc 
  ON searches (created_at DESC);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM filings WHERE property_id = '...';
```

### 3. Caching Strategy

Implement Redis caching for:
- Frequent searches
- NYC Open Data responses (5-minute TTL)
- Search history queries

## Scaling Considerations

### Horizontal Scaling

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      replicas: 3  # Run 3 instances
```

**Requirements**:
- Redis-backed rate limiter (not in-memory)
- Load balancer (nginx, ALB, etc.)
- Session storage if adding authentication

### Database Scaling

- Enable connection pooling (PgBouncer)
- Read replicas for analytics queries
- Regular VACUUM and ANALYZE

## Backup & Recovery

### Automated Backups

```bash
# Daily PostgreSQL backup
pg_dump "$DATABASE_URL" | gzip > backup-$(date +%Y%m%d).sql.gz

# Store in S3 or cloud storage
aws s3 cp backup-*.sql.gz s3://your-bucket/backups/
```

### Restore Procedure

```bash
# Test restore regularly
gunzip < backup-20260330.sql.gz | psql "$DATABASE_URL"
```

## Rollback Plan

If deployment fails:

```bash
# 1. Revert to previous Docker image
docker pull your-registry/nyc-dob-lookup:previous-sha
docker stop nyc-dob-app
docker run -d ... your-registry/nyc-dob-lookup:previous-sha

# 2. Or revert database migration
psql "$DATABASE_URL" < rollback.sql

# 3. Check health
curl http://localhost:3000/api/health
```

## Troubleshooting

### Application won't start

```bash
# Check logs
docker logs nyc-dob-app

# Common issues:
# - DATABASE_URL not set
# - Database not accessible
# - Playwright dependencies missing
```

### Database connection errors

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1"

# Check SSL requirements
# Check network access / security groups
# Verify credentials
```

### Playwright failures

```bash
# Install dependencies in container
docker exec nyc-dob-app npx playwright install chromium --with-deps

# Check headless mode
PLAYWRIGHT_HEADLESS=true

# Review logs
docker logs nyc-dob-app | grep playwright
```

## Post-Deployment Checklist

After deployment, verify:

- [ ] Application responds at root URL
- [ ] Health check returns 200 OK
- [ ] Can perform search successfully
- [ ] CSV export works
- [ ] Search history loads
- [ ] Database writes are persisting
- [ ] Error tracking receiving events
- [ ] Logs are flowing to aggregation service
- [ ] Alerts configured and tested
- [ ] Backup restore tested
- [ ] Load balancer routing correctly
- [ ] SSL certificate valid
- [ ] Rate limiting working
- [ ] No secrets in logs
- [ ] Metrics dashboard displaying data

## Maintenance

### Regular Tasks

- **Daily**: Review error logs and metrics
- **Weekly**: Check database size and performance
- **Monthly**: Review security updates, rotate credentials
- **Quarterly**: Load testing, disaster recovery drill

### Monitoring Alerts

Set up alerts for:
- Health check failures
- Error rate > 5%
- Database latency > 1 second
- API latency > 3 seconds
- Disk usage > 80%
- Memory usage > 90%

## Support

For deployment assistance:
- Review logs: `docker-compose logs -f`
- Check [DEPLOYMENT.md](DEPLOYMENT.md) checklist
- Open GitHub issue with deployment details

---

**Next Steps**: Review [SECURITY.md](SECURITY.md) for security best practices.
