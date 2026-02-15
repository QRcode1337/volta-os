#!/bin/bash

# Start ErisMorn Dashboard (frontend + backend)

echo "🍎 Starting ErisMorn Dashboard..."

# Start backend in background
cd "$(dirname "$0")/server"
echo "   Starting backend on :3001..."
npm run dev &
BACKEND_PID=$!

# Start frontend
cd "$(dirname "$0")"
echo "   Starting frontend on :5173..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "🍎 ErisMorn Dashboard running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop..."

# Wait and handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
