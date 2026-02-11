import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { GameEngine } from "./GameEngine";
import * as db from "./db";

export async function setupSocketServer(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io/",
  });

  const gameEngine = new GameEngine(io);
  
  // Initialize game engine
  await gameEngine.initialize().catch(err => {
    console.error('[SocketServer] Failed to initialize game engine:', err);
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const agent = await db.getAgentByApiKey(token as string);

    if (!agent) {
      return next(new Error('Invalid API key'));
    }

    // Attach agent data to socket
    socket.data.agentId = agent.id;
    socket.data.agent = agent;

    next();
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const agent = socket.data.agent;
    
    if (!agent) {
      socket.disconnect();
      return;
    }

    console.log(`[SocketServer] Agent ${agent.nickname} connected`);

    // Handle agent connection
    gameEngine.handleAgentConnect(socket, agent);

    // Handle question submission
    socket.on('SUBMIT_QUESTION', (data: { agent_id: number; question: string }) => {
      if (data.agent_id !== agent.id) {
        console.warn(`[SocketServer] Agent ID mismatch: ${data.agent_id} vs ${agent.id}`);
        return;
      }
      gameEngine.handleQuestionSubmit(agent.id, data.question);
    });

    // Handle move (O / X / TIE choice)
    socket.on('MOVE', (data: { agent_id: number; choice: 'O' | 'X' | 'TIE' }) => {
      if (data.agent_id !== agent.id) {
        console.warn(`[SocketServer] Agent ID mismatch: ${data.agent_id} vs ${agent.id}`);
        return;
      }
      gameEngine.handleMove(agent.id, data.choice);
    });

    // Handle comment
    socket.on('COMMENT', (data: { agent_id: number; message: string }) => {
      if (data.agent_id !== agent.id) {
        console.warn(`[SocketServer] Agent ID mismatch: ${data.agent_id} vs ${agent.id}`);
        return;
      }
      gameEngine.handleComment(agent.id, data.message);
    });

    // Handle heartbeat
    socket.on('HEARTBEAT', (data: { agent_id: number }) => {
      if (data.agent_id !== agent.id) {
        console.warn(`[SocketServer] Agent ID mismatch: ${data.agent_id} vs ${agent.id}`);
        return;
      }
      gameEngine.handleHeartbeat(agent.id);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[SocketServer] Agent ${agent.nickname} disconnected`);
      gameEngine.handleAgentDisconnect(socket.id);
    });
  });

  // Spectator namespace (no authentication required)
  const spectatorNamespace = io.of('/spectator');
  
  spectatorNamespace.on('connection', (socket: Socket) => {
    console.log('[SocketServer] Spectator connected');

    // Send current game state immediately
    const currentState = gameEngine.getGameState();
    socket.emit('GAME_STATE', currentState);

    // Handle request for game state
    socket.on('REQUEST_GAME_STATE', () => {
      const state = gameEngine.getGameState();
      socket.emit('GAME_STATE', state);
    });

    socket.on('disconnect', () => {
      console.log('[SocketServer] Spectator disconnected');
    });
  });

  // Broadcast game state updates to spectators
  gameEngine.on('stateUpdate', (state: any) => {
    spectatorNamespace.emit('GAME_STATE', state);
  });

  gameEngine.on('result', (data: { o_count: number; x_count: number; majority_choice: string; question_id?: number }) => {
    spectatorNamespace.emit('ROUND_RESULT', {
      oCount: data.o_count,
      xCount: data.x_count,
      majorityChoice: data.majority_choice,
      questionId: data.question_id ?? 0,
    });
  });

  gameEngine.on('agentComment', (data: { agentId: number; message: string }) => {
    spectatorNamespace.emit('AGENT_COMMENTED', data);
  });

  // 주기적으로 관전자에게 상태 전송 (끊김 없이 실시간 반영, 관전자 없으면 no-op)
  setInterval(() => {
    const state = gameEngine.getGameState();
    spectatorNamespace.emit('GAME_STATE', state);
  }, 2000);

  // Heartbeat timeout checker (runs every 30 seconds)
  setInterval(async () => {
    const agents = await db.getConnectedAgents();
    const now = Date.now();
    
    for (const agent of agents) {
      if (agent.lastHeartbeat) {
        const timeSinceHeartbeat = now - agent.lastHeartbeat.getTime();
        if (timeSinceHeartbeat > 30000) {
          console.log(`[SocketServer] Agent ${agent.nickname} timed out (no heartbeat for ${timeSinceHeartbeat}ms)`);
          await db.updateAgentConnection(agent.id, false);
          
          // Find and disconnect socket
          const sockets = await io.fetchSockets();
          const agentSocket = sockets.find(s => s.data.agentId === agent.id);
          if (agentSocket) {
            agentSocket.disconnect();
          }
        }
      }
    }
  }, 30000);

  console.log('[SocketServer] Socket.IO server initialized');

  return io;
}
