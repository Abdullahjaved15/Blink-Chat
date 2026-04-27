# BlinkChat - Smart Random Video Chat

A real-time, web-based video chatting application that connects users instantly with strangers around the world using WebRTC peer-to-peer connections.

## Features

- **Real-Time Video Communication** - WebRTC-powered P2P video/audio chat
- **Smart Matching System** - Interest-based matching with fallback to random pairing
- **Instant "Next" Functionality** - Skip to the next connection instantly
- **Integrated Text Chat** - Real-time messaging during video sessions
- **Modern UI** - Clean, responsive design with dark theme

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Socket.IO Client |
| Backend | Node.js, Express, Socket.IO |
| Video | WebRTC |

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Camera and microphone access

### Installation

```bash
# Install root dependencies
npm install

# Install backend dependencies
npm install --workspace=backend

# Install frontend dependencies
npm install --workspace=frontend
```

### Running the Application

**Option 1: Run both concurrently**
```bash
npm run dev
```

**Option 2: Run separately**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Access the App

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Usage

1. Open http://localhost:3000 in your browser
2. (Optional) Select your interests
3. Click "Start Chatting"
4. Allow camera/microphone access when prompted
5. Once matched, you can:
   - Video/audio chat
   - Send text messages
   - Click "Next" (skip button) to find someone new
   - Click red phone button to end the chat

## Project Structure

```
blinkchat/
├── backend/
│   ├── server.js          # Express + Socket.IO server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React application
│   │   ├── main.jsx       # Entry point
│   │   └── index.css      # Styles
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── package.json           # Root workspace config
```

## API Endpoints

- `GET /api/interests` - List available interests
- `GET /api/stats` - Server statistics (online users, waiting, active sessions)

## Socket.IO Events

### Client → Server
- `join` - Join matchmaking queue with interests
- `skip` - Skip current partner and find new match
- `offer` - WebRTC offer signal
- `answer` - WebRTC answer signal
- `ice-candidate` - WebRTC ICE candidate
- `chat-message` - Send text message

### Server → Client
- `waiting` - Added to waiting queue
- `matched` - Found a match, includes sessionId and partnerId
- `offer` - Received WebRTC offer
- `answer` - Received WebRTC answer
- `ice-candidate` - Received ICE candidate
- `chat-message` - Received text message
- `partner-disconnected` - Partner left the chat

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 14+

## Notes

- This is an MVP with anonymous usage (no authentication)
- STUN servers are used for NAT traversal (public Google STUN)
- For production, add TURN servers for reliable connections behind strict firewalls
