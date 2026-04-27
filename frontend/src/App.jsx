import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, MessageSquare,
  Zap, Users, Clock, ChevronRight, Send, SkipForward, AlertTriangle
} from 'lucide-react';

const AVAILABLE_INTERESTS = [
  'Gaming', 'Music', 'Movies', 'Sports', 'Technology',
  'Travel', 'Food', 'Art', 'Books', 'Fitness',
  'Science', 'Fashion', 'Photography', 'Anime', 'Pets'
];

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, waiting, connected
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [isCaller, setIsCaller] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [stats, setStats] = useState({ online: 0, waiting: 0, activeSessions: 0 });
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('waiting', () => {
      setStatus('waiting');
    });

    newSocket.on('matched', async ({ sessionId: sid, partnerId: pid, isCaller: caller }) => {
      setSessionId(sid);
      setPartnerId(pid);
      setIsCaller(caller);
      setStatus('connected');
      setMessages([]);

      // Initialize WebRTC
      await initWebRTC(caller, pid);
    });

    newSocket.on('offer', async ({ sender, offer }) => {
      if (!peerConnectionRef.current) {
        await initWebRTC(false, sender);
      }
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      newSocket.emit('answer', { target: sender, answer });
    });

    newSocket.on('answer', async ({ sender, answer }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    newSocket.on('ice-candidate', async ({ sender, candidate }) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    });

    newSocket.on('chat-message', ({ sender, message, timestamp }) => {
      setMessages(prev => [...prev, { sender, message, timestamp, own: false }]);
    });

    newSocket.on('partner-disconnected', () => {
      cleanupConnection();
      setStatus('idle');
      setMessages([]);
    });

    // Fetch stats periodically
    const fetchStats = async () => {
      try {
        const res = await fetch(`${SOCKET_URL}/api/stats`);
        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error('Error fetching stats:', e);
      }
    };

    fetchStats();
    const statsInterval = setInterval(fetchStats, 5000);

    return () => {
      clearInterval(statsInterval);
      cleanupConnection();
      newSocket.close();
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const cleanupConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setSessionId(null);
    setPartnerId(null);
  };

  const initWebRTC = async (asCaller, targetId) => {
    try {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      peerConnectionRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote stream
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', {
            target: targetId,
            candidate: event.candidate
          });
        }
      };

      // Create offer if caller
      if (asCaller && socketRef.current) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('offer', { target: targetId, offer });
      }
    } catch (error) {
      console.error('WebRTC init error:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  const toggleInterest = (interest) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const startChat = () => {
    if (socketRef.current) {
      setStatus('waiting');
      socketRef.current.emit('join', { interests: selectedInterests });
    }
  };

  const skipChat = () => {
    if (socketRef.current) {
      cleanupConnection();
      socketRef.current.emit('skip');
      setMessages([]);
    }
  };

  const endChat = () => {
    cleanupConnection();
    if (socketRef.current) {
      socketRef.current.emit('skip');
    }
    setStatus('idle');
    setMessages([]);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !sessionId || !socketRef.current) return;

    const message = chatInput.trim();
    socketRef.current.emit('chat-message', { sessionId, message });
    setMessages(prev => [...prev, {
      sender: socketRef.current.id,
      message,
      timestamp: Date.now(),
      own: true
    }]);
    setChatInput('');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <Zap className="logo-icon" />
          BlinkChat
        </div>
        <div className="stats">
          <div className="stat-item online">
            <Users size={16} />
            {stats.online} online
          </div>
          <div className="stat-item">
            <Clock size={16} />
            {stats.waiting} waiting
          </div>
          <div className="stat-item">
            <MessageSquare size={16} />
            {stats.activeSessions} chatting
          </div>
        </div>
      </header>

      <main className="main">
        {status === 'idle' && (
          <div className="welcome-screen">
            <h1>Connect Instantly</h1>
            <p>Meet new people through video chat. Select your interests to find like-minded connections.</p>

            <div className="interest-section">
              <h3>Select your interests (optional)</h3>
              <div className="interests-grid">
                {AVAILABLE_INTERESTS.map(interest => (
                  <button
                    key={interest}
                    className={`interest-tag ${selectedInterests.includes(interest) ? 'selected' : ''}`}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" onClick={startChat}>
              Start Chatting <ChevronRight size={20} />
            </button>
          </div>
        )}

        {status === 'waiting' && (
          <div className="loading-screen">
            <div className="spinner"></div>
            <p>Finding someone to chat with...</p>
          </div>
        )}

        {status === 'connected' && (
          <div className="video-chat">
            <div className="video-section">
              <div className="video-grid">
                <div className="video-container">
                  {isVideoOff ? (
                    <div className="video-placeholder">
                      <VideoOff size={64} />
                      <span>Camera off</span>
                    </div>
                  ) : (
                    <video ref={localVideoRef} autoPlay muted playsInline />
                  )}
                  <span className="video-label">You</span>
                </div>
                <div className="video-container">
                  <video ref={remoteVideoRef} autoPlay playsInline />
                  <span className="video-label">Partner</span>
                </div>
              </div>

              <div className="controls">
                <button
                  className={`control-btn ${isMuted ? 'danger' : ''}`}
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
                <button
                  className={`control-btn ${isVideoOff ? 'danger' : ''}`}
                  onClick={toggleVideo}
                  title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>
                <button
                  className="control-btn"
                  onClick={skipChat}
                  title="Next person"
                >
                  <SkipForward size={24} />
                </button>
                <button
                  className="control-btn danger"
                  onClick={endChat}
                  title="End chat"
                >
                  <PhoneOff size={24} />
                </button>
              </div>
            </div>

            <div className="chat-section">
              <div className="chat-header">
                <MessageSquare size={18} /> Chat
              </div>
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
                    No messages yet. Say hello!
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`chat-message ${msg.own ? 'own' : 'partner'}`}
                  >
                    {msg.message}
                    <div className="timestamp">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit">
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
