# AI Novel Writer - Manual QA Script

## Prerequisites
- Docker and Docker Compose installed
- `.env` file configured with required variables

## Step 1: Start the Application
```bash
docker compose up -d
docker compose logs -f
```

**Expected**: All services (db, web, worker) start successfully

## Step 2: Admin Setup
1. Navigate to `http://localhost:3000/setup`
2. Enter admin email and password
3. Enter `ADMIN_SETUP_TOKEN` from `.env`
4. Click "Create Admin"

**Expected**: Admin account created, redirected to login

## Step 3: User Registration & Login
1. Navigate to `http://localhost:3000`
2. Register a new user account
3. Login with credentials

**Expected**: Successfully logged in, see dashboard

## Step 4: Configure Provider
1. Go to Settings/Providers
2. Add OpenAI/Claude/Gemini configuration:
   - Name: "My Provider"
   - Provider Type: openai/claude/gemini
   - Base URL: API endpoint
   - API Key: Your key
   - Default Model: gpt-4/claude-3/gemini-pro

**Expected**: Provider saved (API key encrypted in database)

## Step 5: Create Novel
1. Go to Novels
2. Click "New Novel"
3. Enter title
4. Click "Create"

**Expected**: Novel created, can view novel page

## Step 6: Create Chapter
1. Open novel
2. Click "New Chapter"
3. Enter chapter title
4. Save

**Expected**: Chapter created with order number

## Step 7: Generate Content (Job System)
1. Open chapter
2. Click "Generate"
3. Enter prompt or use template
4. Submit generation job

**Expected**: Job queued, worker processes it, content appears

## Step 8: Version Management
1. Edit chapter content
2. Save (creates new version)
3. View version history
4. Compare two versions
5. Rollback to previous version

**Expected**: Can see diff, rollback works

## Step 9: Upload Files (Materials)
1. Go to Materials
2. Upload image (PNG/JPG, <10MB)
3. Upload document (PDF/TXT, <20MB)

**Expected**: Files uploaded to `/data/uploads`, metadata saved

## Step 10: Memory Extraction
1. Complete a chapter
2. Trigger memory extraction job
3. View structured memory (characters, locations, plot points)

**Expected**: JSON memory snapshot created

## Step 11: Export
1. Go to novel
2. Click "Export"
3. Select format (TXT/MD)
4. Select chapters (or all)
5. Download

**Expected**: File downloads with correct content

## Step 12: Usage & Audit
1. Go to Usage page
2. View token counts and estimated costs
3. Go to Audit page (admin only)
4. View audit log entries

**Expected**: All actions logged, usage tracked

## Step 13: Admin Functions (Admin Only)
1. Login as admin
2. Go to Admin panel
3. View user list
4. View audit logs
5. Manage model prices

**Expected**: Admin can manage users and view system logs

## Verification Checklist
- [ ] Docker Compose starts all services
- [ ] Admin setup works (one-time only)
- [ ] User registration and login work
- [ ] Provider config saves encrypted
- [ ] Novel and chapter CRUD works
- [ ] Job system processes async tasks
- [ ] Worker consumes jobs and calls LLM
- [ ] Version management (save/compare/rollback)
- [ ] File upload with size/type limits
- [ ] Memory extraction creates structured data
- [ ] Export generates TXT/MD files
- [ ] Usage tracking records tokens/cost
- [ ] Audit log captures all actions
- [ ] Admin can manage system

## Troubleshooting
- Check logs: `docker compose logs -f web worker`
- Check database: `docker compose exec db psql -U postgres -d aiwriter`
- Restart services: `docker compose restart`
- Reset database: `docker compose down -v && docker compose up -d`
