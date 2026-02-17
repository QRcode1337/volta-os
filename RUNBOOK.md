# CASCADE Runbook

## 1) Required Env Vars

Reference `server/.env.example`.

Minimum required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY`

Behavior flags:
- `API_STUB_MODE=true|false` (default `true`)
- `CASCADE_SCHEDULER_ENABLED=true|false` (default `false`)
- `CASCADE_SCHEDULER_INTERVAL_MS=30000` (optional)

## 2) Start Backend

```bash
cd ~/ErisMorn/volta-os/.worktrees/agentforge-cascade-integration
npx tsx server/index.ts
```

## 3) Start Frontend

```bash
cd ~/ErisMorn/volta-os/.worktrees/agentforge-cascade-integration
npx vite
```

## 4) Smoke Tests

Trigger:

```bash
curl -s -X POST http://localhost:3001/api/cascade/trigger/missed-call \
  -H "Content-Type: application/json" \
  -d '{"phone":"+14105551212","name":"Jamie","source":"missed_call"}' | jq
```

Check pending:

```bash
curl -s http://localhost:3001/api/cascade/nurture/pending | jq
```

Wait ~60s, check pending again:

```bash
curl -s http://localhost:3001/api/cascade/nurture/pending | jq
```

## 5) Expected Output (Examples)

Trigger:

```json
{
  "ok": true,
  "leadId": "5f8f8f70-58f3-4aa8-a036-29f7d1e8b0d1",
  "created": true,
  "scheduledNurture": true,
  "memoryId": "5c2a3f6f-8f6e-43d3-996f-bcd9fbe45d0f"
}
```

Pending immediately after trigger:

```json
{
  "success": true,
  "messages": [
    {
      "id": "f95e4d07-4b2d-4d0e-b72a-e33db5f42a56",
      "lead_id": "5f8f8f70-58f3-4aa8-a036-29f7d1e8b0d1",
      "sequence_type": "follow_up",
      "channel": "sms",
      "step": 1,
      "sent": false
    }
  ]
}
```

Pending after scheduler run:

```json
{
  "success": true,
  "messages": []
}
```
