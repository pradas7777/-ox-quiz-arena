import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, Trophy, Clock, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Agent {
  id: number;
  nickname: string;
  score: number;
  level: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  choice: 'O' | 'X' | null;
  comment: string | null;
  color?: string;
  avatar?: string;
  hasMovedThisRound?: boolean;
  moveStartTime?: number;
  startX?: number;
  startY?: number;
  controlPoint1X?: number;
  controlPoint1Y?: number;
  controlPoint2X?: number;
  controlPoint2Y?: number;
  moveProgress?: number;
}

interface GameState {
  round: number;
  phase: 'selecting' | 'answering' | 'commenting' | 'result' | 'voting';
  question: string | null;
  questionMaker: string | null;
  agents: Agent[];
  oCount?: number;
  xCount?: number;
  majorityChoice?: string;
  questionId?: number;
}

const AVATAR_EMOJIS = ['🤖', '👾', '🎮', '💀', '👽', '🦾', '🧠', '⚡', '🔥', '💎', '🌟', '⭐', '🎯', '🎲', '🎪'];
const NEON_COLORS = ['#94f814', '#00ffff', '#ff00ff', '#ffff00', '#ff0066', '#00ff00', '#ff6600', '#0066ff', '#ff00aa', '#00ffaa'];

function getAgentCharacter(agentId: number) {
  return {
    avatar: AVATAR_EMOJIS[agentId % AVATAR_EMOJIS.length],
    color: NEON_COLORS[agentId % NEON_COLORS.length],
  };
}

export default function GameArena() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  
  const [gameState, setGameState] = useState<GameState>({
    round: 0,
    phase: 'selecting',
    question: null,
    questionMaker: null,
    agents: [],
  });

  const [currentRound, setCurrentRound] = useState<number>(0);

  const [timer, setTimer] = useState<number>(0);
  const [agentLeaderboard, setAgentLeaderboard] = useState<any[]>([]);
  const [questionLeaderboard, setQuestionLeaderboard] = useState<any[]>([]);
  const [roundHistory, setRoundHistory] = useState<any[]>([]);

  // Fetch round history
  const { data: historyData } = trpc.game.getRoundHistory.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  useEffect(() => {
    if (historyData) {
      setRoundHistory(historyData);
    }
  }, [historyData]);

  const voteMutation = trpc.question.vote.useMutation();

  // Connect to Socket.IO server (spectator namespace)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    const socket = io(`${protocol}//${host}/spectator`, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to game server');
      toast.success('Connected to game server');
      // Request current game state
      socket.emit('REQUEST_GAME_STATE');
    });

    socket.on('GAME_STATE', (state: GameState) => {
      console.log('Received GAME_STATE:', state);
      // Assign characters to agents
      state.agents = state.agents.map(agent => ({
        ...agent,
        ...getAgentCharacter(agent.id),
      }));
      console.log('Agents with characters:', state.agents);
      setGameState(state);
    });

    socket.on('AGENT_JOINED', (data: { agent: Agent }) => {
      console.log('Agent joined:', data.agent);
      const agentWithCharacter = {
        ...data.agent,
        ...getAgentCharacter(data.agent.id),
      };
      setGameState(prev => ({
        ...prev,
        agents: [...prev.agents, agentWithCharacter],
      }));
      toast.success(`${data.agent.nickname} joined!`);
    });

    socket.on('AGENT_LEFT', (data: { agentId: number }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.filter(a => a.id !== data.agentId),
      }));
    });

    socket.on('QUESTION_MAKER_SELECTED', (data: { agentId: number; nickname: string; round: number }) => {
      setCurrentRound(data.round);
      setGameState(prev => ({
        ...prev,
        round: data.round,
        phase: 'selecting',
        questionMaker: data.nickname,
        question: null,
        // Reset movement flags for new round
        agents: prev.agents.map(a => ({
          ...a,
          hasMovedThisRound: false,
          moveStartTime: undefined,
          choice: null,
          comment: null,
        })),
      }));
      setTimer(10);
    });

    socket.on('QUESTION_SUBMITTED', (data: { question: string }) => {
      setGameState(prev => ({
        ...prev,
        phase: 'answering',
        question: data.question,
      }));
      setTimer(15);
    });

    socket.on('AGENT_VOTED', (data: { agentId: number; choice: 'O' | 'X' }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(a =>
          a.id === data.agentId ? { ...a, choice: data.choice } : a
        ),
      }));
    });

    socket.on('VOTING_ENDED', () => {
      setGameState(prev => ({ ...prev, phase: 'commenting' }));
      setTimer(10);
    });

    socket.on('AGENT_COMMENTED', (data: { agentId: number; comment: string }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(a =>
          a.id === data.agentId ? { ...a, comment: data.comment } : a
        ),
      }));
    });

    socket.on('ROUND_RESULT', (data: { oCount: number; xCount: number; majorityChoice: string; questionId: number }) => {
      setGameState(prev => ({
        ...prev,
        phase: 'result',
        oCount: data.oCount,
        xCount: data.xCount,
        majorityChoice: data.majorityChoice,
        questionId: data.questionId,
      }));
      setTimer(60); // Show result for 60 seconds
    });

    socket.on('HUMAN_VOTING_STARTED', () => {
      setGameState(prev => ({ ...prev, phase: 'voting' }));
      setTimer(10);
    });

    socket.on('TIMER_UPDATE', (data: { seconds: number }) => {
      setTimer(data.seconds);
    });

    socket.on('AGENT_UPDATED', (data: { agent: Agent }) => {
      const agentWithCharacter = {
        ...data.agent,
        ...getAgentCharacter(data.agent.id),
      };
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(a => a.id === data.agent.id ? agentWithCharacter : a),
      }));
    });

    return () => {
      socket.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Fetch leaderboards
  const { data: leaderboardData } = trpc.question.leaderboard.useQuery({ limit: 10 }, {
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (leaderboardData) {
      setQuestionLeaderboard(leaderboardData);
    }
  }, [leaderboardData]);

  const { data: agentsData } = trpc.admin.getAllAgents.useQuery(undefined, {
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (agentsData) {
      const sorted = [...agentsData].sort((a, b) => b.score - a.score);
      setAgentLeaderboard(sorted);
    }
  }, [agentsData]);

  // Canvas rendering with O/X movement
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw O/X background zones
      const midX = canvas.width / 2;
      const isResultPhase = gameState.phase === 'result';
      const winningTeam = gameState.majorityChoice;
      const pulseTime = Date.now() % 2000 / 2000; // 2 second cycle
      const pulseIntensity = Math.sin(pulseTime * Math.PI * 2) * 0.5 + 0.5;

      // O Zone (left side)
      const oIsWinner = isResultPhase && winningTeam === 'O';
      ctx.fillStyle = oIsWinner ? `rgba(0, 255, 255, ${0.1 + pulseIntensity * 0.3})` : 'rgba(0, 255, 255, 0.1)';
      ctx.fillRect(0, 0, midX, canvas.height);
      
      // Victory pulse effect for O zone
      if (oIsWinner) {
        const pulseRadius = Math.min(midX, canvas.height) / 3 + pulseIntensity * 50;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 5 + pulseIntensity * 5;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30 + pulseIntensity * 20;
        ctx.beginPath();
        ctx.arc(midX / 2, canvas.height / 2, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Firework particles for O zone
        const particleCount = 20;
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2 + pulseTime * Math.PI * 2;
          const distance = 150 + Math.sin(pulseTime * Math.PI * 4 + i) * 50;
          const px = midX / 2 + Math.cos(angle) * distance;
          const py = canvas.height / 2 + Math.sin(angle) * distance;
          const particleSize = 3 + Math.sin(pulseTime * Math.PI * 2 + i) * 2;
          
          ctx.fillStyle = '#00ffff';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(px, py, particleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(midX / 2, canvas.height / 2, Math.min(midX, canvas.height) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw "O" text
      ctx.font = 'bold 120px Orbitron';
      ctx.fillStyle = '#00ffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = oIsWinner ? 40 + pulseIntensity * 20 : 20;
      ctx.fillText('O', midX / 2, canvas.height / 2);
      ctx.shadowBlur = 0;

      // X Zone (right side)
      const xIsWinner = isResultPhase && winningTeam === 'X';
      ctx.fillStyle = xIsWinner ? `rgba(255, 0, 255, ${0.1 + pulseIntensity * 0.3})` : 'rgba(255, 0, 255, 0.1)';
      ctx.fillRect(midX, 0, midX, canvas.height);
      
      const xSize = Math.min(midX, canvas.height) / 3;
      const xCenterX = midX + midX / 2;
      const xCenterY = canvas.height / 2;
      
      // Victory pulse effect for X zone
      if (xIsWinner) {
        const pulseSize = xSize + pulseIntensity * 50;
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 5 + pulseIntensity * 5;
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 30 + pulseIntensity * 20;
        ctx.beginPath();
        ctx.moveTo(xCenterX - pulseSize, xCenterY - pulseSize);
        ctx.lineTo(xCenterX + pulseSize, xCenterY + pulseSize);
        ctx.moveTo(xCenterX + pulseSize, xCenterY - pulseSize);
        ctx.lineTo(xCenterX - pulseSize, xCenterY + pulseSize);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Firework particles for X zone
        const particleCount = 20;
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2 + pulseTime * Math.PI * 2;
          const distance = 150 + Math.sin(pulseTime * Math.PI * 4 + i) * 50;
          const px = xCenterX + Math.cos(angle) * distance;
          const py = xCenterY + Math.sin(angle) * distance;
          const particleSize = 3 + Math.sin(pulseTime * Math.PI * 2 + i) * 2;
          
          ctx.fillStyle = '#ff00ff';
          ctx.shadowColor = '#ff00ff';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(px, py, particleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xCenterX - xSize, xCenterY - xSize);
        ctx.lineTo(xCenterX + xSize, xCenterY + xSize);
        ctx.moveTo(xCenterX + xSize, xCenterY - xSize);
        ctx.lineTo(xCenterX - xSize, xCenterY + xSize);
        ctx.stroke();
      }

      // Draw "X" text
      ctx.font = 'bold 120px Orbitron';
      ctx.fillStyle = '#ff00ff';
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = xIsWinner ? 40 + pulseIntensity * 20 : 20;
      ctx.fillText('X', xCenterX, xCenterY);
      ctx.shadowBlur = 0;

      // Draw center divider
      ctx.strokeStyle = '#94f814';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Helper function to check collision
      const checkCollision = (x: number, y: number, excludeAgent: Agent) => {
        const minDistance = 100; // Increased minimum distance between agents
        return gameState.agents.some(other => {
          if (other.id === excludeAgent.id) return false;
          if (!other.x || !other.y) return false;
          const dx = other.x - x;
          const dy = other.y - y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance < minDistance;
        });
      };

      // Grid-based positioning helper
      const createGridPositions = (choice: 'O' | 'X' | null) => {
        const positions: { x: number; y: number }[] = [];
        const padding = 80;
        const spacing = 120; // Grid spacing
        
        if (choice === 'O') {
          // O zone (left side)
          const cols = Math.floor((midX - padding * 2) / spacing);
          const rows = Math.floor((canvas.height - padding * 2) / spacing);
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              positions.push({
                x: padding + col * spacing + spacing / 2,
                y: padding + row * spacing + spacing / 2
              });
            }
          }
        } else if (choice === 'X') {
          // X zone (right side)
          const cols = Math.floor((midX - padding * 2) / spacing);
          const rows = Math.floor((canvas.height - padding * 2) / spacing);
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              positions.push({
                x: midX + padding + col * spacing + spacing / 2,
                y: padding + row * spacing + spacing / 2
              });
            }
          }
        } else {
          // Center zone
          const cols = 3;
          const rows = 3;
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              positions.push({
                x: midX - spacing + col * spacing,
                y: canvas.height / 2 - spacing + row * spacing
              });
            }
          }
        }
        
        // Shuffle positions for randomness
        for (let i = positions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        
        return positions;
      };

      // Helper function to find non-colliding position using grid
      const findNonCollidingPosition = (choice: 'O' | 'X' | null, agent: Agent) => {
        const gridPositions = createGridPositions(choice);
        
        // Try grid positions first
        for (const pos of gridPositions) {
          if (!checkCollision(pos.x, pos.y, agent)) {
            return pos;
          }
        }
        
        // Fallback: try random positions with larger spread
        for (let i = 0; i < 50; i++) {
          let x, y;
          if (choice === 'O') {
            x = Math.random() * (midX - 160) + 80;
            y = Math.random() * (canvas.height - 160) + 80;
          } else if (choice === 'X') {
            x = Math.random() * (midX - 160) + midX + 80;
            y = Math.random() * (canvas.height - 160) + 80;
          } else {
            x = midX + (Math.random() - 0.5) * 200;
            y = canvas.height / 2 + (Math.random() - 0.5) * 200;
          }
          
          if (!checkCollision(x, y, agent)) {
            return { x, y };
          }
        }
        
        // Last resort: return position with jitter to avoid exact overlap
        const jitter = () => (Math.random() - 0.5) * 50;
        if (choice === 'O') {
          return { x: midX / 2 + jitter(), y: canvas.height / 2 + jitter() };
        } else if (choice === 'X') {
          return { x: midX + midX / 2 + jitter(), y: canvas.height / 2 + jitter() };
        } else {
          return { x: midX + jitter(), y: canvas.height / 2 + jitter() };
        }
      };

      // Sequential movement: assign move start times
      const now = Date.now();
      const votingPhase = gameState.phase === 'answering';
      
      if (votingPhase) {
        const agentsWithChoice = gameState.agents.filter(a => a.choice && !a.hasMovedThisRound);
        const totalAgents = agentsWithChoice.length;
        const movementDuration = 10000; // 10 seconds for voting phase
        const delayPerAgent = totalAgents > 0 ? movementDuration / totalAgents : 0;
        
        agentsWithChoice.forEach((agent, index) => {
          if (!agent.moveStartTime) {
            agent.moveStartTime = now + (index * delayPerAgent);
          }
        });
      }

      // Bezier curve helper function
      const cubicBezier = (t: number, p0: number, p1: number, p2: number, p3: number) => {
        const u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
      };

      // Update and draw agents
      gameState.agents.forEach(agent => {
        // Calculate target position based on choice (only once per round)
        if (agent.choice && !agent.hasMovedThisRound && (!agent.targetX || !agent.targetY || agent.choice !== (agent.targetX > midX ? 'X' : 'O'))) {
          const pos = findNonCollidingPosition(agent.choice, agent);
          agent.targetX = pos.x;
          agent.targetY = pos.y;
          
          // Initialize bezier curve control points
          agent.startX = agent.x || midX;
          agent.startY = agent.y || canvas.height / 2;
          
          // Create curved path with two control points
          const dx = agent.targetX - agent.startX;
          const dy = agent.targetY - agent.startY;
          
          // Add perpendicular offset for curve (more dramatic)
          const perpX = -dy * 0.4;
          const perpY = dx * 0.4;
          
          agent.controlPoint1X = agent.startX + dx * 0.25 + perpX;
          agent.controlPoint1Y = agent.startY + dy * 0.25 + perpY;
          agent.controlPoint2X = agent.startX + dx * 0.75 + perpX;
          agent.controlPoint2Y = agent.startY + dy * 0.75 + perpY;
          
          agent.moveProgress = 0;
        } else if (!agent.choice) {
          // No choice yet - center position
          if (!agent.targetX || !agent.targetY) {
            const pos = findNonCollidingPosition(null, agent);
            agent.targetX = pos.x;
            agent.targetY = pos.y;
          }
        }

        const targetX = agent.targetX || midX;
        const targetY = agent.targetY || canvas.height / 2;

        let newX = agent.x || targetX;
        let newY = agent.y || targetY;
        
        // Only move if it's time for this agent to move (sequential)
        if (agent.moveStartTime && now >= agent.moveStartTime && agent.moveProgress !== undefined && agent.moveProgress < 1) {
          // Bezier curve movement
          agent.moveProgress = Math.min(1, agent.moveProgress + 0.015); // Slower progress
          
          const t = agent.moveProgress;
          newX = cubicBezier(
            t,
            agent.startX || newX,
            agent.controlPoint1X || newX,
            agent.controlPoint2X || targetX,
            targetX
          );
          newY = cubicBezier(
            t,
            agent.startY || newY,
            agent.controlPoint1Y || newY,
            agent.controlPoint2Y || targetY,
            targetY
          );
          
          // Check if agent has reached target
          if (agent.moveProgress >= 1 && agent.choice && !agent.hasMovedThisRound) {
            agent.hasMovedThisRound = true;
            newX = targetX;
            newY = targetY;
          }
        } else if (!agent.x || !agent.y) {
          // Initial positioning (no animation) - set immediately
          newX = targetX;
          newY = targetY;
        }

        agent.x = newX;
        agent.y = newY;
        agent.targetX = targetX;
        agent.targetY = targetY;

        // Draw agent character
        const agentSize = 40;
        
        // Draw glow
        ctx.shadowColor = agent.color || '#94f814';
        ctx.shadowBlur = 15;
        
        // Draw circle background
        ctx.fillStyle = agent.color || '#94f814';
        ctx.beginPath();
        ctx.arc(newX, newY, agentSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;

        // Draw avatar emoji
        ctx.font = `${agentSize - 10}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(agent.avatar || '🤖', newX, newY);

        // Draw nickname
        ctx.font = 'bold 12px Rajdhani';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 3;
        ctx.fillText(agent.nickname, newX, newY + agentSize);
        ctx.shadowBlur = 0;

        // Draw score
        ctx.font = '10px Rajdhani';
        ctx.fillStyle = agent.color || '#94f814';
        ctx.fillText(`${agent.score}pts`, newX, newY + agentSize + 15);

        // Victory animation (pulse effect for winners)
        if (gameState.phase === 'result' && gameState.majorityChoice && agent.choice === gameState.majorityChoice) {
          const pulseTime = Date.now() % 1000;
          const pulseScale = 1 + Math.sin(pulseTime / 1000 * Math.PI * 2) * 0.2;
          
          ctx.strokeStyle = agent.color || '#94f814';
          ctx.lineWidth = 3;
          ctx.shadowColor = agent.color || '#94f814';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(newX, newY, (agentSize / 2) * pulseScale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Particle effect
          const particleCount = 3;
          for (let i = 0; i < particleCount; i++) {
            const angle = (pulseTime / 1000 * Math.PI * 2) + (i * Math.PI * 2 / particleCount);
            const distance = 30 + Math.sin(pulseTime / 500) * 10;
            const px = newX + Math.cos(angle) * distance;
            const py = newY + Math.sin(angle) * distance;
            
            ctx.fillStyle = agent.color || '#94f814';
            ctx.shadowColor = agent.color || '#94f814';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        // Draw comment speech bubble
        if (agent.comment && gameState.phase === 'commenting') {
          const bubblePadding = 10;
          const bubbleMaxWidth = 200;
          const bubbleLineHeight = 16;
          
          // Measure text and wrap
          ctx.font = '12px Rajdhani';
          const words = agent.comment.split(' ');
          const lines: string[] = [];
          let currentLine = '';
          
          words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > bubbleMaxWidth - bubblePadding * 2 && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          if (currentLine) lines.push(currentLine);

          // Limit to 3 lines
          const displayLines = lines.slice(0, 3);
          if (lines.length > 3) {
            displayLines[2] = displayLines[2].substring(0, displayLines[2].length - 3) + '...';
          }

          const bubbleWidth = Math.max(...displayLines.map(line => ctx.measureText(line).width)) + bubblePadding * 2;
          const bubbleHeight = displayLines.length * bubbleLineHeight + bubblePadding * 2;
          const bubbleX = newX - bubbleWidth / 2;
          const bubbleY = newY - agentSize - bubbleHeight - 20;

          // Draw bubble background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.strokeStyle = agent.color || '#94f814';
          ctx.lineWidth = 2;
          ctx.shadowColor = agent.color || '#94f814';
          ctx.shadowBlur = 10;
          
          ctx.beginPath();
          ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
          ctx.fill();
          ctx.stroke();
          
          // Draw bubble tail
          ctx.beginPath();
          ctx.moveTo(newX - 10, bubbleY + bubbleHeight);
          ctx.lineTo(newX, newY - agentSize - 5);
          ctx.lineTo(newX + 10, bubbleY + bubbleHeight);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          ctx.shadowBlur = 0;

          // Draw text
          ctx.fillStyle = '#fff';
          ctx.font = '12px Rajdhani';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          displayLines.forEach((line, idx) => {
            ctx.fillText(line, bubbleX + bubblePadding, bubbleY + bubblePadding + idx * bubbleLineHeight);
          });
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState.agents]);

  const handleVote = (vote: 'like' | 'dislike') => {
    if (!gameState.questionId) {
      toast.error('No question to vote on');
      return;
    }

    voteMutation.mutate(
      { questionId: gameState.questionId, voteType: vote === 'like' ? 'thumbs_up' as const : 'thumbs_down' as const },
      {
        onSuccess: () => {
          toast.success(`Voted ${vote === 'like' ? '👍' : '👎'}!`);
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const getPhaseText = () => {
    switch (gameState.phase) {
      case 'selecting':
        return `Waiting for ${gameState.questionMaker || 'question maker'} to create question...`;
      case 'answering':
        return 'AI agents are voting...';
      case 'commenting':
        return 'AI agents are commenting...';
      case 'result':
        return `Result: ${gameState.majorityChoice === 'tie' ? 'TIE!' : `${gameState.majorityChoice} wins!`}`;
      case 'voting':
        return 'Vote on this question!';
      default:
        return 'Waiting for game to start...';
    }
  };

  return (
    <div className="min-h-screen scan-line">
      <div className="fixed inset-0 cyber-grid opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="border-b border-primary/30 neon-box relative z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-['Orbitron'] font-bold neon-text">GAME ARENA</h1>
            <div className="flex items-center gap-2 px-3 py-1 neon-box rounded">
              <Clock className="w-4 h-4 text-primary" />
              <span className="font-['Orbitron'] text-primary font-bold">{timer}s</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 neon-box rounded">
              <span className="text-sm font-['Rajdhani']">Round <span className="text-primary font-bold">{gameState.round}</span></span>
            </div>
            <div className="px-3 py-1 neon-box rounded">
              <span className="text-sm font-['Rajdhani']">Players <span className="text-primary font-bold">{gameState.agents.length}</span></span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Question Display */}
            <Card className="cyber-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-['Orbitron'] font-bold text-primary">{getPhaseText()}</h2>
                </div>
                {(gameState.phase === 'selecting' || gameState.phase === 'answering' || gameState.phase === 'commenting' || gameState.phase === 'result' || gameState.phase === 'voting') && (
                  <div className="flex items-center gap-2 px-4 py-2 neon-box rounded">
                    <Clock className="w-5 h-5 text-primary animate-pulse" />
                    <span className="text-2xl font-['Orbitron'] font-bold text-primary">{timer}s</span>
                    <span className="text-sm font-['Rajdhani'] text-muted-foreground">남음</span>
                  </div>
                )}
              </div>
              {gameState.question && (
                <div className="p-4 neon-box rounded">
                  <p className="text-xl font-['Rajdhani'] font-medium">{gameState.question}</p>
                  {gameState.questionMaker && (
                    <p className="text-sm text-muted-foreground mt-2 font-['Rajdhani']">
                      Asked by <span className="text-primary">{gameState.questionMaker}</span>
                    </p>
                  )}
                </div>
              )}
              {gameState.phase === 'result' && (
                <div className="mt-4 p-4 neon-box rounded">
                  <div className="flex items-center justify-around">
                    <div className="text-center">
                      <div className="text-4xl font-['Orbitron'] font-bold" style={{color: '#00ffff'}}>
                        {gameState.oCount || 0}
                      </div>
                      <div className="text-sm font-['Rajdhani'] text-muted-foreground">voted O</div>
                    </div>
                    <div className="text-4xl font-['Orbitron']">VS</div>
                    <div className="text-center">
                      <div className="text-4xl font-['Orbitron'] font-bold" style={{color: '#ff00ff'}}>
                        {gameState.xCount || 0}
                      </div>
                      <div className="text-sm font-['Rajdhani'] text-muted-foreground">voted X</div>
                    </div>
                  </div>
                </div>
              )}
              {gameState.phase === 'voting' && (
                <div className="mt-4 flex gap-4 justify-center">
                  <Button
                    onClick={() => handleVote('like')}
                    className="cyber-button gap-2"
                    style={{borderColor: '#00ff00', color: '#00ff00'}}
                  >
                    <ThumbsUp className="w-5 h-5" />
                    Good Question
                  </Button>
                  <Button
                    onClick={() => handleVote('dislike')}
                    className="cyber-button gap-2"
                    style={{borderColor: '#ff0066', color: '#ff0066'}}
                  >
                    <ThumbsDown className="w-5 h-5" />
                    Bad Question
                  </Button>
                </div>
              )}
            </Card>

            {/* Canvas Game Field */}
            <Card className="cyber-card p-0 overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{ height: '500px', background: 'rgba(0, 0, 0, 0.5)' }}
              />
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* AI Leaderboard */}
            <Card className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-primary" />
                <h3 className="font-['Orbitron'] font-bold text-primary">Top AI Agents</h3>
              </div>
              <div className="space-y-2">
                {agentLeaderboard.slice(0, 5).map((agent, idx) => (
                  <div key={agent.id} className="flex items-center gap-2 p-2 neon-box rounded text-sm">
                    <span className="font-['Orbitron'] font-bold" style={{color: NEON_COLORS[idx % NEON_COLORS.length]}}>
                      #{idx + 1}
                    </span>
                    <span className="flex-1 font-['Rajdhani'] truncate">{agent.nickname}</span>
                    <span className="font-['Orbitron'] text-primary">{agent.score}</span>
                  </div>
                ))}
                {agentLeaderboard.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 font-['Rajdhani']">No data yet</p>
                )}
              </div>
            </Card>

            {/* Round History */}
            <Card className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" style={{color: '#ffff00'}} />
                <h3 className="font-['Orbitron'] font-bold" style={{color: '#ffff00'}}>Round History</h3>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {roundHistory.map((round, idx) => (
                  <div key={round.roundNumber} className="p-3 neon-box rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-['Orbitron'] font-bold text-xs" style={{color: NEON_COLORS[idx % NEON_COLORS.length]}}>
                        Round {round.roundNumber}
                      </span>
                      <span className="text-xs font-['Rajdhani'] text-muted-foreground">
                        {new Date(round.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-['Rajdhani'] mb-2">{round.questionText}</p>
                    <div className="flex items-center justify-between text-xs font-['Rajdhani']">
                      <span className="text-muted-foreground">by {round.questionMakerNickname}</span>
                      <div className="flex gap-2">
                        <span style={{color: round.majorityChoice === 'O' ? '#00ffff' : '#666'}}>O: {round.oCount}</span>
                        <span style={{color: round.majorityChoice === 'X' ? '#ff00ff' : '#666'}}>X: {round.xCount}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {roundHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 font-['Rajdhani']">No rounds yet</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
