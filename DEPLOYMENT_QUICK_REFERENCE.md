# QUICK REFERENCE GUIDE - Emenyu Deployment Safety

**Print this or bookmark it for quick reference**

---

## 🚨 THE GOLDEN RULE

**NEVER UPLOAD**:
- `.env` files (contains DATABASE_URL + API keys)
- `backups/` folders (customer data)
- `logs/` folders (contains error details)
- `node_modules/`, `venv/` (rebuilt from package.json / Requirements.txt)
- `*.log`, `*.zip`, `*.sql` files
- `uploads/`, `orders/`, `tables/`, `history/` (move only if archived)

---

## ✅ ALWAYS SAFE TO UPLOAD

- `package.json`, `Requirements.txt`
- `*.js`, `*.py`, `*.html`, `*.css` source files
- `.env.example` (template without values)
- `*.md` documentation (unless it contains credentials)
- `src/`, `public/`, `frontend/` folders

---

## 🔍 BEFORE YOU DEPLOY

### Checklist (Copy & Paste)

```
☐ Tested locally: npm start
☐ No .env in upload
☐ No node_modules/ in upload
☐ No backups/ in upload
☐ git check-ignore .env → Shows .env ✓
☐ grep -r "DATABASE_URL" src/ → Shows NOTHING ✓
☐ Ready to upload!
```

### Test Commands

```bash
# 1. Verify .env is ignored
git check-ignore .env

# 2. Check for hardcoded secrets
grep -r "DATABASE_URL" src/
grep -r "JWT_SECRET" src/
grep -r "API_KEY" src/
# All should return: NOTHING

# 3. Create clean package
zip -r deploy.zip . \
  --exclude="*.env" \
  --exclude="node_modules/*" \
  --exclude="backups/*" \
  --exclude="logs/*"
```

---

## 🔐 ENVIRONMENT SETUP

### Local Development

```bash
# Copy template
cp Sites/Trump/dont_upload/ENV_TEMPLATE.txt .env

# Edit with YOUR values
nano .env
# Fill in DATABASE_URL, API_KEY, etc.

# Load environment
source .env  # Linux/Mac
# or on Windows: $env:DATABASE_URL="..."
```

### Production Deployment

```bash
# DO NOT upload .env file
# Instead set environment variables on platform:

# Heroku:
heroku config:set DATABASE_URL="postgresql://..."
heroku config:set JWT_SECRET="your-secret"

# Vercel:
# Set in Dashboard → Settings → Environment Variables

# Traditional VPS:
# Set in PM2 config or systemd unit file
```

---

## 📍 WHERE TO FIND HELP

**For your restaurant**, read these files (in order):

1. 📄 `dont_upload/README.md` - Main guide
2. ⚠️ `dont_upload/UPLOAD_WARNINGS.md` - What NOT to do
3. ✅ `dont_upload/SAFE_DEPLOYMENT_GUIDE.md` - How to deploy
4. 📋 `dont_upload/PRIVATE_FILES_REPORT.md` - Detailed inventory
5. 📝 `dont_upload/ENV_TEMPLATE.txt` - Copy for .env

**Example** (for Trump site):
- `Sites/Trump/dont_upload/README.md`
- `Sites/Trump/dont_upload/UPLOAD_WARNINGS.md`
- etc.

---

## 🆘 IF SOMETHING GOES WRONG

### "Database connection failed"

```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Should show: postgresql://user:password@localhost:5432/db

# If missing: source your .env file
source .env
```

### "Cannot find API key"

```bash
# Check API_KEY is set
echo $OPENAI_API_KEY

# If missing: check .env has the right values
cat .env | grep OPENAI
```

### "I accidentally uploaded .env"

1. **STOP** - Don't deploy further
2. **Tell team lead IMMEDIATELY**
3. **Change database password**
4. **Regenerate API keys**
5. If in Git: `git filter-branch --tree-filter 'rm -f .env' HEAD`

---

## 📊 DEPLOYMENT STEPS

```
1. Develop locally
   npm install
   npm start

2. Test everything works
   curl http://localhost:3000/api/health

3. Prepare package
   zip -r deploy.zip . --exclude="*.env" --exclude="node_modules/*"

4. Upload to server
   scp deploy.zip user@server:~/

5. Deploy
   npm install --production
   npm run prisma:migrate
   npm start

6. Verify
   curl http://server:3000/api/health
```

---

## 🔑 SECURITY TIPS

✅ **DO**:
- Use strong random passwords (openssl rand -hex 32)
- Rotate credentials quarterly
- Keep .env file on your machine only
- Use platform environment variables for production
- Check .gitignore before committing

❌ **DON'T**:
- Hardcode credentials in source code
- Commit .env to Git
- Share .env files
- Put secrets in documentation
- Commit backups to version control
- Use same password for all services

---

## 📞 NEED HELP?

1. Check: `dont_upload/README.md` for your site
2. Read: `dont_upload/UPLOAD_WARNINGS.md`
3. Follow: `dont_upload/SAFE_DEPLOYMENT_GUIDE.md`
4. Review: `dont_upload/PRIVATE_FILES_REPORT.md`
5. Ask: Team lead if unsure

**When in doubt: NEVER UPLOAD IT**

---

## 🎯 QUICK FACTS

- `dont_upload/` exists in every restaurant site
- `.gitignore` automatically protects dangerous files
- No manual file deletion needed (just don't upload)
- Archives are safe in `dont_upload/archive/`
- All running apps are unaffected
- Deployment is now safer than before

---

**Last Updated**: 2026-05-20  
**Keep this handy!**
