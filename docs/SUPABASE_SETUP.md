# Supabase Setup Guide

## 1. Create Supabase Project

1. Go to https://supabase.com
2. Create new project: "volta-os-integration"
3. Choose region: closest to you
4. Generate secure database password
5. Wait for provisioning (~2 minutes)

## 2. Enable pgvector Extension

1. Go to Database → Extensions
2. Search for "vector"
3. Enable "vector" extension
4. Confirm enablement

## 3. Get API Credentials

1. Go to Settings → API
2. Copy:
   - Project URL (SUPABASE_URL)
   - anon/public key (SUPABASE_ANON_KEY)
   - service_role key (SUPABASE_SERVICE_KEY)

## 4. Configure Environment

Add to `server/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
```
