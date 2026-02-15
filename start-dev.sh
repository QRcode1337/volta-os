#!/bin/bash

# VOLTA OS Development Launcher
# Starts both backend and frontend servers

echo "🍎 Starting VOLTA OS Development Environment..."
echo ""

# Check if backend dependencies are installed
if [ ! -d "server/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd server && npm install && cd ..
fi

# Check if frontend dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Check for .env file
if [ ! -f "server/.env" ]; then
    echo "⚠️  Warning: server/.env file not found"
    echo "   Create server/.env with:"
    echo "   ANTHROPIC_API_KEY=your_key_here"
    echo "   ERISMORN_ROOT=/path/to/ErisMorn"
    echo ""
fi

echo "🚀 Launching servers..."
echo ""
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start backend in background
cd server && npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start frontend (blocks)
npm run dev

# Cleanup: kill backend when frontend stops
kill $BACKEND_PID 2>/dev/null
