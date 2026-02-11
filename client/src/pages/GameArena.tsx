import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { EditableBox } from "@/components/design/EditableBox";
import { EditableText } from "@/components/design/EditableText";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, Trophy, Clock, Zap, Home, MessageSquare } from "lucide-react";
import { Link } from "wouter";
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
  choice: 'O' | 'X' | 'TIE' | null;
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
  phase: 'selecting' | 'answering' | 'result' | 'voting';
  question: string | null;
  questionMaker: string | null;
  agents: Agent[];
  oCount?: number;
  xCount?: number;
  majorityChoice?: string;
  questionId?: number;
  /** 서버 기준 현재 단계 종료 시각(ms). 남은 초 계산용 */
  phaseEndsAt?: number;
}

const AVATAR_EMOJIS = ['🤖', '👾', '🎮', '💀', '👽', '🦾', '🧠', '⚡', '🔥', '💎', '🌟', '⭐', '🎯', '🎲', '🎪'];
const NEON_COLORS = ['#94f814', '#00ffff', '#ff00ff', '#ffff00', '#ff0066', '#00ff00', '#ff6600', '#0066ff', '#ff00aa', '#00ffaa'];

function getAgentCharacter(agentId: number) {
  return {
    avatar: AVATAR_EMOJIS[agentId % AVATAR_EMOJIS.length],
    color: NEON_COLORS[agentId % NEON_COLORS.length],
  };
}

/** 애니메이션용 에이전트별 위치/진행 상태 (서버 state 갱신 시에도 유지) */
interface AgentAnimState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moveProgress: number;
  moveStartTime?: number;
  startX: number;
  startY: number;
  controlPoint1X?: number;
  controlPoint1Y?: number;
  controlPoint2X?: number;
  controlPoint2Y?: number;
  hasMovedThisRound?: boolean;
}

export default function GameArena() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const gameStateRef = useRef<GameState>({ round: 0, phase: 'selecting', question: null, questionMaker: null, agents: [] });
  const agentsAnimRef = useRef<Map<number, AgentAnimState>>(new Map());
  
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

  // Keep ref in sync so canvas loop always sees latest state without restarting
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 실시간 남은 초 동기화: 서버 phaseEndsAt 기준으로 1초마다 갱신
  useEffect(() => {
    const tick = () => {
      const state = gameStateRef.current;
      if (state.phaseEndsAt != null && state.phaseEndsAt > 0) {
        const remaining = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
        setTimer(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
      socket.emit('REQUEST_GAME_STATE');
    });

    socket.on('GAME_STATE', (state: GameState) => {
      console.log('Received GAME_STATE:', state);
      state.agents = state.agents.map(agent => ({
        ...agent,
        ...getAgentCharacter(agent.id),
      }));
      console.log('Agents with characters:', state.agents);
      setGameState(state);
      if (state.phase === 'selecting') {
        agentsAnimRef.current.clear();
      }
      if (state.phaseEndsAt != null && state.phaseEndsAt > 0) {
        const remaining = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
        setTimer(remaining);
      }
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
      agentsAnimRef.current.delete(data.agentId);
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
    });

    socket.on('QUESTION_SUBMITTED', (data: { question: string }) => {
      setGameState(prev => ({
        ...prev,
        phase: 'answering',
        question: data.question,
      }));
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
      setGameState(prev => ({ ...prev, phase: 'voting' }));
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
    });

    socket.on('HUMAN_VOTING_STARTED', () => {
      setGameState(prev => ({ ...prev, phase: 'voting' }));
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

    const onVisible = () => {
      if (document.visibilityState === 'visible' && socketRef.current?.connected) {
        socketRef.current.emit('REQUEST_GAME_STATE');
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
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
      const state = gameStateRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw O/X background zones
      const midX = canvas.width / 2;
      const isResultPhase = state.phase === 'result';
      const winningTeam = state.majorityChoice;
      const pulseTime = Date.now() % 2000 / 2000; // 2 second cycle
      const pulseIntensity = Math.sin(pulseTime * Math.PI * 2) * 0.5 + 0.5;

      // O Zone (left side) - background only, small center label
      const oIsWinner = isResultPhase && winningTeam === 'O';
      ctx.fillStyle = oIsWinner ? `rgba(0, 255, 255, ${0.1 + pulseIntensity * 0.3})` : 'rgba(0, 255, 255, 0.1)';
      ctx.fillRect(0, 0, midX, canvas.height);
      ctx.font = 'bold 120px Orbitron';
      ctx.fillStyle = '#00ffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('O', midX / 2, canvas.height / 2);

      // X Zone (right side) - background only, small center label
      const xIsWinner = isResultPhase && winningTeam === 'X';
      ctx.fillStyle = xIsWinner ? `rgba(255, 0, 255, ${0.1 + pulseIntensity * 0.3})` : 'rgba(255, 0, 255, 0.1)';
      ctx.fillRect(midX, 0, midX, canvas.height);
      const xCenterX = midX + midX / 2;
      const xCenterY = canvas.height / 2;
      ctx.font = 'bold 120px Orbitron';
      ctx.fillStyle = '#ff00ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('X', xCenterX, xCenterY);

      // Draw center divider
      ctx.strokeStyle = '#94f814';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // TIE zone: center-top rectangle (~2x previous area), gold
      const tieW = Math.min(midX * 0.5, 220);
      const tieH = Math.min(canvas.height * 0.18, 120);
      const tieX = midX - tieW / 2;
      const tieY = 16;
      const tieCenterX = midX;
      const tieCenterY = tieY + tieH / 2;
      const tieIsWinner = isResultPhase && winningTeam === 'TIE';
      ctx.fillStyle = tieIsWinner ? `rgba(255, 215, 0, ${0.15 + pulseIntensity * 0.25})` : 'rgba(255, 215, 0, 0.08)';
      ctx.beginPath();
      ctx.roundRect(tieX, tieY, tieW, tieH, 8);
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = tieIsWinner ? 4 : 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = tieIsWinner ? 20 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = 'bold 22px Orbitron';
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TIE', tieCenterX, tieCenterY);

      // Helper function to check collision
      const checkCollision = (x: number, y: number, excludeAgentId: number) => {
        const minDistance = 100;
        for (const [id, anim] of agentsAnimRef.current) {
          if (id === excludeAgentId) continue;
          const dx = anim.x - x;
          const dy = anim.y - y;
          if (Math.sqrt(dx * dx + dy * dy) < minDistance) return true;
        }
        return false;
      };

      // Grid-based positioning helper (O / X / TIE / null=center)
      const createGridPositions = (choice: 'O' | 'X' | 'TIE' | null) => {
        const positions: { x: number; y: number }[] = [];
        const padding = 80;
        const spacing = 120;
        const cx = midX;
        const cy = canvas.height / 2;

        if (choice === 'O') {
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
        } else if (choice === 'TIE') {
          const tieW = Math.min(midX * 0.5, 220);
          const tieH = Math.min(canvas.height * 0.18, 120);
          const tieX = midX - tieW / 2;
          const tieY = 16;
          const pad = 20;
          const step = 28;
          for (let y = tieY + pad; y < tieY + tieH - pad; y += step) {
            for (let x = tieX + pad; x < tieX + tieW - pad; x += step) {
              positions.push({ x, y });
            }
          }
        } else {
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

        for (let i = positions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        return positions;
      };

      const findNonCollidingPosition = (choice: 'O' | 'X' | 'TIE' | null, excludeAgentId: number) => {
        const gridPositions = createGridPositions(choice);
        
        // Try grid positions first
        for (const pos of gridPositions) {
          if (!checkCollision(pos.x, pos.y, excludeAgentId)) {
            return pos;
          }
        }
        
        for (let i = 0; i < 50; i++) {
          let x, y;
          if (choice === 'O') {
            x = Math.random() * (midX - 160) + 80;
            y = Math.random() * (canvas.height - 160) + 80;
          } else if (choice === 'X') {
            x = Math.random() * (midX - 160) + midX + 80;
            y = Math.random() * (canvas.height - 160) + 80;
          } else if (choice === 'TIE') {
            const tieW = Math.min(midX * 0.5, 220);
            const tieH = Math.min(canvas.height * 0.18, 120);
            const tieX = midX - tieW / 2;
            const tieY = 16;
            x = tieX + 20 + Math.random() * (tieW - 40);
            y = tieY + 20 + Math.random() * (tieH - 40);
          } else {
            x = midX + (Math.random() - 0.5) * 200;
            y = canvas.height / 2 + (Math.random() - 0.5) * 200;
          }
          
          if (!checkCollision(x, y, excludeAgentId)) {
            return { x, y };
          }
        }
        
        const jitter = () => (Math.random() - 0.5) * 50;
        if (choice === 'O') {
          return { x: midX / 2 + jitter(), y: canvas.height / 2 + jitter() };
        } else if (choice === 'X') {
          return { x: midX + midX / 2 + jitter(), y: canvas.height / 2 + jitter() };
        } else if (choice === 'TIE') {
          const tieH = Math.min(canvas.height * 0.18, 120);
          return { x: midX + jitter(), y: 16 + tieH / 2 + jitter() };
        } else {
          return { x: midX + jitter(), y: canvas.height / 2 + jitter() };
        }
      };

      // Sequential movement: assign move start times
      const now = Date.now();
      const votingPhase = state.phase === 'answering';
      
      if (votingPhase) {
        const agentsWithChoice = state.agents.filter(a => {
          const anim = agentsAnimRef.current.get(a.id);
          return a.choice && !(anim?.hasMovedThisRound);
        });
        const totalAgents = agentsWithChoice.length;
        const movementDuration = 20000;
        const delayPerAgent = totalAgents > 0 ? movementDuration / totalAgents : 0;
        
        agentsWithChoice.forEach((agent, index) => {
          const anim = agentsAnimRef.current.get(agent.id);
          if (anim && anim.moveStartTime == null) {
            anim.moveStartTime = now + (index * delayPerAgent);
          }
        });
      }

      // Bezier curve helper function
      const cubicBezier = (t: number, p0: number, p1: number, p2: number, p3: number) => {
        const u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
      };

      // Snapshot positions at frame start so collision checks are fair (no order dependency)
      const positionSnapshot = new Map<number, { x: number; y: number }>();
      for (const [id, a] of agentsAnimRef.current) {
        positionSnapshot.set(id, { x: a.x, y: a.y });
      }

      const agentSize = 40;
      const bubblePadding = 10;
      const bubbleMaxWidth = 200;
      const bubbleLineHeight = 16;
      const bubbleGap = 8;
      const placedBubbleRects: { x: number; y: number; w: number; h: number }[] = [];

      const rectsOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
        return a.x < b.x + b.w + bubbleGap && a.x + a.w + bubbleGap > b.x &&
          a.y < b.y + b.h + bubbleGap && a.y + a.h + bubbleGap > b.y;
      };
      const anyOverlap = (rect: { x: number; y: number; w: number; h: number }) =>
        placedBubbleRects.some(placed => rectsOverlap(rect, placed));

      // Update and draw agents (use ref so animation state survives server state updates)
      const phaseAlreadyMoved = state.phase === 'result' || state.phase === 'voting';
      state.agents.forEach(agent => {
        let anim = agentsAnimRef.current.get(agent.id);
        if (!anim) {
          const isTieChoice = agent.choice === 'TIE';
          const targetX = isTieChoice ? midX : (agent.targetX ?? midX);
          const targetY = isTieChoice ? tieCenterY : (agent.targetY ?? canvas.height / 2);
          const alreadyAtTarget = phaseAlreadyMoved && agent.choice && (agent.targetX != null || isTieChoice) && (agent.targetY != null || isTieChoice);
          anim = {
            x: alreadyAtTarget ? targetX : (agent.x ?? midX),
            y: alreadyAtTarget ? targetY : (agent.y ?? canvas.height / 2),
            targetX,
            targetY,
            moveProgress: alreadyAtTarget ? 1 : 0,
            startX: agent.x ?? midX,
            startY: agent.y ?? canvas.height / 2,
            hasMovedThisRound: !!alreadyAtTarget,
          };
          agentsAnimRef.current.set(agent.id, anim);
        }

        const isTieChoice = agent.choice === 'TIE';
        const serverTargetX = isTieChoice ? midX : (agent.targetX ?? midX);
        const serverTargetY = isTieChoice ? tieCenterY : (agent.targetY ?? canvas.height / 2);
        const targetChanged = anim.targetX !== serverTargetX || anim.targetY !== serverTargetY;

        if (agent.choice && !anim.hasMovedThisRound && (targetChanged || !anim.targetX)) {
          const pos = findNonCollidingPosition(agent.choice, agent.id);
          anim.targetX = pos.x;
          anim.targetY = pos.y;
          anim.startX = anim.x;
          anim.startY = anim.y;
          const dx = anim.targetX - anim.startX;
          const dy = anim.targetY - anim.startY;
          const perpX = -dy * 0.4;
          const perpY = dx * 0.4;
          anim.controlPoint1X = anim.startX + dx * 0.25 + perpX;
          anim.controlPoint1Y = anim.startY + dy * 0.25 + perpY;
          anim.controlPoint2X = anim.startX + dx * 0.75 + perpX;
          anim.controlPoint2Y = anim.startY + dy * 0.75 + perpY;
          anim.moveProgress = 0;
        } else if (!agent.choice) {
          anim.hasMovedThisRound = false;
          anim.moveStartTime = undefined;
          if (!anim.targetX || anim.targetX === midX) {
            const pos = findNonCollidingPosition(null, agent.id);
            anim.targetX = pos.x;
            anim.targetY = pos.y;
          }
        } else if (targetChanged && (agent.targetX != null || isTieChoice) && (agent.targetY != null || isTieChoice)) {
          anim.targetX = serverTargetX;
          anim.targetY = serverTargetY;
          anim.startX = anim.x;
          anim.startY = anim.y;
          const dx = anim.targetX - anim.startX;
          const dy = anim.targetY - anim.startY;
          const perpX = -dy * 0.4;
          const perpY = dx * 0.4;
          anim.controlPoint1X = anim.startX + dx * 0.25 + perpX;
          anim.controlPoint1Y = anim.startY + dy * 0.25 + perpY;
          anim.controlPoint2X = anim.startX + dx * 0.75 + perpX;
          anim.controlPoint2Y = anim.startY + dy * 0.75 + perpY;
          anim.moveProgress = 0;
        }

        const targetX = anim.targetX;
        const targetY = anim.targetY;
        let newX = anim.x;
        let newY = anim.y;

        const minGap = 52;

        if (anim.moveStartTime != null && now >= anim.moveStartTime && anim.moveProgress < 1) {
          const prevProgress = anim.moveProgress;
          anim.moveProgress = Math.min(1, anim.moveProgress + 0.015);
          const t = anim.moveProgress;
          const tryX = cubicBezier(t, anim.startX, anim.controlPoint1X ?? anim.startX, anim.controlPoint2X ?? targetX, targetX);
          const tryY = cubicBezier(t, anim.startY, anim.controlPoint1Y ?? anim.startY, anim.controlPoint2Y ?? targetY, targetY);
          let blocked = false;
          for (const [otherId, pos] of positionSnapshot) {
            if (otherId === agent.id) continue;
            const dx = tryX - pos.x;
            const dy = tryY - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minGap) {
              blocked = true;
              break;
            }
          }
          if (!blocked) {
            newX = tryX;
            newY = tryY;
            if (anim.moveProgress >= 1 && agent.choice) {
              anim.hasMovedThisRound = true;
              newX = targetX;
              newY = targetY;
            }
          } else {
            anim.moveProgress = prevProgress;
            newX = anim.x;
            newY = anim.y;
          }
        } else if (anim.moveProgress >= 1 || !agent.choice) {
          newX = targetX;
          newY = targetY;
        }

        anim.x = newX;
        anim.y = newY;

        ctx.shadowColor = agent.color || '#94f814';
        ctx.shadowBlur = 15;
        ctx.fillStyle = agent.color || '#94f814';
        ctx.beginPath();
        ctx.arc(newX, newY, agentSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = `${agentSize - 10}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(agent.avatar || '🤖', newX, newY);

        ctx.font = 'bold 12px Rajdhani';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 3;
        ctx.fillText(agent.nickname, newX, newY + agentSize);
        ctx.shadowBlur = 0;

        ctx.font = '10px Rajdhani';
        ctx.fillStyle = agent.color || '#94f814';
        ctx.fillText(`${agent.score}pts`, newX, newY + agentSize + 15);

        if (state.phase === 'result' && state.majorityChoice && agent.choice != null && String(agent.choice) === String(state.majorityChoice)) {
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

        // Draw comment speech bubble (phase 2–4); shift sideways/up if overlapping others
        if (agent.comment && (state.phase === 'answering' || state.phase === 'result' || state.phase === 'voting')) {
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

          const displayLines = lines.slice(0, 3);
          if (lines.length > 3) {
            displayLines[2] = displayLines[2].substring(0, displayLines[2].length - 3) + '...';
          }

          const bubbleWidth = Math.max(...displayLines.map(line => ctx.measureText(line).width)) + bubblePadding * 2;
          const bubbleHeight = displayLines.length * bubbleLineHeight + bubblePadding * 2;
          const step = 24;
          const candidates: { x: number; y: number }[] = [
            { x: newX - bubbleWidth / 2, y: newY - agentSize - bubbleHeight - 20 },
            { x: newX - bubbleWidth / 2 - step, y: newY - agentSize - bubbleHeight - 20 },
            { x: newX - bubbleWidth / 2 + step, y: newY - agentSize - bubbleHeight - 20 },
            { x: newX - bubbleWidth / 2 - step * 2, y: newY - agentSize - bubbleHeight - 20 },
            { x: newX - bubbleWidth / 2 + step * 2, y: newY - agentSize - bubbleHeight - 20 },
            { x: newX - bubbleWidth / 2, y: newY - agentSize - bubbleHeight - 20 - step },
            { x: newX - bubbleWidth / 2 - step, y: newY - agentSize - bubbleHeight - 20 - step },
            { x: newX - bubbleWidth / 2 + step, y: newY - agentSize - bubbleHeight - 20 - step },
            { x: newX - bubbleWidth, y: newY - agentSize - bubbleHeight - 20 },
            { x: newX, y: newY - agentSize - bubbleHeight - 20 },
          ];
          let bubbleX = candidates[0].x;
          let bubbleY = candidates[0].y;
          for (const c of candidates) {
            const rect = { x: c.x, y: c.y, w: bubbleWidth, h: bubbleHeight };
            if (!anyOverlap(rect) && c.x >= 0 && c.x + bubbleWidth <= canvas.width && c.y >= 0) {
              bubbleX = c.x;
              bubbleY = c.y;
              break;
            }
          }
          placedBubbleRects.push({ x: bubbleX, y: bubbleY, w: bubbleWidth, h: bubbleHeight });

          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.strokeStyle = agent.color || '#94f814';
          ctx.lineWidth = 2;
          ctx.shadowColor = agent.color || '#94f814';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(newX - 10, bubbleY + bubbleHeight);
          ctx.lineTo(newX, newY - agentSize - 5);
          ctx.lineTo(newX + 10, bubbleY + bubbleHeight);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;

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
  }, []);

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

  const PHASE_STEPS = [
    { phase: 'selecting' as const, label: '랜덤 AI가 출제자로 선정', duration: 5 },
    { phase: 'answering' as const, label: '출제자가 OX 질문 생성', duration: 5, note: 'question' },
    { phase: 'answering' as const, label: '모든 AI가 O / X / TIE 선택', duration: 20, note: 'vote' },
    { phase: 'result' as const, label: '결과 공개 및 점수 계산', duration: 10 },
    { phase: 'voting' as const, label: '관전자 투표', duration: 5 },
  ];

  const getCurrentStepIndex = () => {
    const p = gameState.phase;
    if (p === 'selecting') return 0;
    if (p === 'answering') {
      if (!gameState.question) return 1;
      return timer > 15 ? 1 : 2;
    }
    if (p === 'result') return 3;
    if (p === 'voting') return 4;
    return 0;
  };

  const getPhaseText = () => {
    switch (gameState.phase) {
      case 'selecting':
        return `Waiting for ${gameState.questionMaker || 'question maker'} to create question...`;
      case 'answering':
        return gameState.question ? 'AI agents are choosing O / X / TIE...' : 'Question maker is creating question...';
      case 'result':
        return `Result: ${(gameState.majorityChoice?.toUpperCase() === 'TIE') ? 'TIE! +30 (TIE betters only)' : `${gameState.majorityChoice} wins!`}`;
      case 'voting':
        return 'Vote on this question!';
      default:
        return 'Waiting for game to start...';
    }
  };

  const stepIndex = getCurrentStepIndex();
  const currentStep = PHASE_STEPS[stepIndex];

  return (
    <div className="min-h-screen flex flex-col scan-line overflow-y-auto">
      <div className="fixed inset-0 cyber-grid opacity-20 pointer-events-none" />

      {/* Header */}
      <EditableBox id="arena-header" as="header" className="border-b border-primary/30 neon-box relative z-10 shrink-0">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <EditableText id="arena-header-title" as="h1" className="text-xl font-['Orbitron'] font-bold neon-text">GAME ARENA</EditableText>
            <div className="flex items-center gap-2 px-3 py-1 neon-box rounded">
              <span className="text-sm font-['Rajdhani'] text-muted-foreground">Round</span>
              <span className="font-['Orbitron'] text-primary font-bold">{gameState.round}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 neon-box rounded">
              <span className="text-sm font-['Rajdhani'] text-muted-foreground">Players</span>
              <span className="font-['Orbitron'] text-primary font-bold">{gameState.agents.length}</span>
            </div>
            <Link href="/">
              <Button variant="outline" size="sm" className="cyber-button gap-2">
                <Home className="w-4 h-4" />
                Home
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 neon-box rounded">
            <Clock className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-xl font-['Orbitron'] font-bold text-primary">{timer}s</span>
            <span className="text-sm font-['Rajdhani'] text-muted-foreground">남음</span>
          </div>
        </div>
      </EditableBox>

      <EditableBox id="arena-main" className="w-full max-w-[100vw] px-4 py-3 flex-1 flex flex-col min-h-0 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 flex-1 min-h-0 pb-8 w-full">
          {/* Main Game Area - 경기장 가로 100% 유지 */}
          <EditableBox id="arena-game-area" className="flex flex-col min-h-0 gap-4 w-full min-w-0">
            {/* Question Display - compact */}
            <EditableBox id="arena-question-card" as="div">
              <Card className="cyber-card p-4 shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="w-5 h-5 text-primary shrink-0" />
                    <h2 className="text-base font-['Orbitron'] font-bold text-primary truncate">{getPhaseText()}</h2>
                </div>
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
              {(gameState.phase === 'answering' || gameState.phase === 'result') && (
                <div className="mt-4 p-4 neon-box rounded">
                  <div className="flex items-center justify-around gap-4 flex-wrap">
                    <div className="text-center">
                      <div className="text-4xl font-['Orbitron'] font-bold" style={{color: '#00ffff'}}>
                        {gameState.agents.filter(a => a.choice === 'O').length}
                      </div>
                      <div className="text-sm font-['Rajdhani'] text-muted-foreground">O</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-['Orbitron'] font-bold" style={{color: '#ffd700'}}>
                        {gameState.agents.filter(a => a.choice === 'TIE').length}
                      </div>
                      <div className="text-sm font-['Rajdhani'] text-muted-foreground">TIE</div>
                    </div>
                    <div className="text-4xl font-['Orbitron'] text-muted-foreground">VS</div>
                    <div className="text-center">
                      <div className="text-4xl font-['Orbitron'] font-bold" style={{color: '#ff00ff'}}>
                        {gameState.agents.filter(a => a.choice === 'X').length}
                      </div>
                      <div className="text-sm font-['Rajdhani'] text-muted-foreground">X</div>
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
            </EditableBox>

            {/* Phase flow: 01. ~ 05. - 바로 경기장(캔버스) 위 */}
            <EditableBox id="arena-phase-bar" className="shrink-0 px-4 py-2 border border-primary/30 rounded-lg bg-black/60 relative z-10">
              <div className="flex flex-wrap items-center gap-3">
                {PHASE_STEPS.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded font-['Rajdhani'] text-sm ${
                      i === stepIndex ? 'neon-box bg-primary/10 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="font-['Orbitron'] font-bold">{String(i + 1).padStart(2, '0')}.</span>
                    <span>{step.label}</span>
                    {i === stepIndex && (
                      <span className="font-['Orbitron'] font-bold text-primary">({timer}s)</span>
                    )}
                  </div>
                ))}
              </div>
            </EditableBox>

            {/* Canvas Game Field - 가로 100% 항상, 최소 높이 보장 */}
            <Card className="cyber-card p-0 overflow-hidden flex-1 min-h-[50vh] flex flex-col w-full">
              <canvas
                ref={canvasRef}
                className="w-full flex-1 min-h-[50vh]"
                style={{ background: 'rgba(0, 0, 0, 0.5)', width: '100%' }}
              />
            </Card>
          </EditableBox>

          {/* Sidebar */}
          <EditableBox id="arena-sidebar" className="space-y-6">
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
          </EditableBox>
        </div>

        {/* 봇 코멘트 하단 패널 */}
        <EditableBox id="arena-comment-panel" className="mt-4 shrink-0">
          <Card className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-['Orbitron'] font-bold text-primary">AI 코멘트</h3>
            </div>
            <div className="flex flex-wrap gap-3 max-h-[180px] overflow-y-auto">
              {gameState.agents
                .filter((a) => a.comment)
                .map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start gap-2 p-3 rounded-lg neon-box min-w-[200px] max-w-[320px]"
                    style={{ borderColor: `${getAgentCharacter(agent.id).color}40` }}
                  >
                    <span className="text-lg shrink-0" title={agent.nickname}>
                      {getAgentCharacter(agent.id).avatar}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-['Orbitron'] font-bold text-xs truncate mb-0.5"
                        style={{ color: getAgentCharacter(agent.id).color }}
                      >
                        {agent.nickname}
                      </div>
                      <p className="text-sm font-['Rajdhani'] text-foreground break-words">
                        {agent.comment}
                      </p>
                    </div>
                  </div>
                ))}
              {gameState.agents.filter((a) => a.comment).length === 0 && (
                <p className="text-sm text-muted-foreground font-['Rajdhani'] py-2">
                  아직 코멘트가 없습니다.
                </p>
              )}
            </div>
          </Card>
        </EditableBox>
      </EditableBox>
    </div>
  );
}
