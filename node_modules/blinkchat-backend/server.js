import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// In-memory user storage
const waitingQueue = [];
const activeSessions = new Map();
const userSocketMap = new Map();

// Available interests
const AVAILABLE_INTERESTS = [
  'Gaming', 'Music', 'Movies', 'Sports', 'Technology',
  'Travel', 'Food', 'Art', 'Books', 'Fitness',
  'Science', 'Fashion', 'Photography', 'Anime', 'Pets'
];

// Find best match based on interests
function findMatch(userId, interests) {
  const user = userSocketMap.get(userId);
  if (!user) return null;

  let bestMatch = null;
  let maxCommonInterests = -1;

  for (const waitingUser of waitingQueue) {
    if (waitingUser.id === userId) continue;
    if (waitingUser.lastSkipped && Date.now() - waitingUser.lastSkipped < 2000) continue;

    const commonInterests = interests.filter(interest =>
      waitingUser.interests.includes(interest)
    );

    if (commonInterests.length > maxCommonInterests) {
      maxCommonInterests = commonInterests.length;
      bestMatch = waitingUser;
    }
  }

  return bestMatch;
}

// Create session between two users
function createSession(user1, user2) {
  const sessionId = `${user1.id}-${user2.id}-${Date.now()}`;
  const session = {
    id: sessionId,
    user1: { id: user1.id, socket: user1.socket, interests: user1.interests },
    user2: { id: user2.id, socket: user2.socket, interests: user2.interests },
    createdAt: Date.now()
  };

  activeSessions.set(sessionId, session);
  user1.sessionId = sessionId;
  user2.sessionId = sessionId;

  // Remove from waiting queue
  const idx1 = waitingQueue.findIndex(u => u.id === user1.id);
  const idx2 = waitingQueue.findIndex(u => u.id === user2.id);
  if (idx1 > -1) waitingQueue.splice(idx1, 1);
  if (idx2 > -1) waitingQueue.splice(idx2, 1);

  return session;
}

// End session
function endSession(sessionId, initiatorId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const otherUser = session.user1.id === initiatorId ? session.user2 : session.user1;

  activeSessions.delete(sessionId);

  // Notify other user
  otherUser.socket.emit('partner-disconnected');

  // Clear session references
  const user1 = userSocketMap.get(session.user1.id);
  const user2 = userSocketMap.get(session.user2.id);
  if (user1) user1.sessionId = null;
  if (user2) user2.sessionId = null;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', ({ interests = [] }) => {
    const user = {
      id: socket.id,
      socket: socket,
      interests: interests,
      sessionId: null,
      lastSkipped: null
    };

    userSocketMap.set(socket.id, user);

    // Try to find a match
    const match = findMatch(socket.id, interests);

    if (match) {
      const session = createSession(user, match);

      // Notify both users
      socket.emit('matched', {
        sessionId: session.id,
        partnerId: match.id,
        isCaller: true
      });

      match.socket.emit('matched', {
        sessionId: session.id,
        partnerId: socket.id,
        isCaller: false
      });
    } else {
      // Add to waiting queue
      waitingQueue.push(user);
      socket.emit('waiting');
    }
  });

  // WebRTC signaling
  socket.on('offer', ({ target, offer }) => {
    socket.to(target).emit('offer', {
      sender: socket.id,
      offer
    });
  });

  socket.on('answer', ({ target, answer }) => {
    socket.to(target).emit('answer', {
      sender: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    socket.to(target).emit('ice-candidate', {
      sender: socket.id,
      candidate
    });
  });

  // Text chat
  socket.on('chat-message', ({ sessionId, message }) => {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    const partner = session.user1.id === socket.id ? session.user2 : session.user1;
    partner.socket.emit('chat-message', {
      sender: socket.id,
      message,
      timestamp: Date.now()
    });
  });

  // Skip/Next functionality
  socket.on('skip', () => {
    const user = userSocketMap.get(socket.id);
    if (!user) return;

    user.lastSkipped = Date.now();

    // End current session if exists
    if (user.sessionId) {
      endSession(user.sessionId, socket.id);
    }

    // Remove from waiting queue if present
    const queueIdx = waitingQueue.findIndex(u => u.id === socket.id);
    if (queueIdx > -1) {
      waitingQueue.splice(queueIdx, 1);
    }

    // Put back in queue with cooldown
    setTimeout(() => {
      if (userSocketMap.has(socket.id)) {
        waitingQueue.push(user);
        socket.emit('waiting');

        // Try to match immediately
        const match = findMatch(socket.id, user.interests);
        if (match) {
          const session = createSession(user, match);

          socket.emit('matched', {
            sessionId: session.id,
            partnerId: match.id,
            isCaller: true
          });

          match.socket.emit('matched', {
            sessionId: session.id,
            partnerId: socket.id,
            isCaller: false
          });
        }
      }
    }, 1000);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    const user = userSocketMap.get(socket.id);
    if (user) {
      // End session if active
      if (user.sessionId) {
        endSession(user.sessionId, socket.id);
      }

      // Remove from queue
      const queueIdx = waitingQueue.findIndex(u => u.id === socket.id);
      if (queueIdx > -1) {
        waitingQueue.splice(queueIdx, 1);
      }

      userSocketMap.delete(socket.id);
    }
  });
});

app.get('/api/interests', (req, res) => {
  res.json(AVAILABLE_INTERESTS);
});

app.get('/api/stats', (req, res) => {
  res.json({
    online: userSocketMap.size,
    waiting: waitingQueue.length,
    activeSessions: activeSessions.size
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`BlinkChat server running on port ${PORT}`);
});
