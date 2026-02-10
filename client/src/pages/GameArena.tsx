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

  const [timer, setTimer] = useState<number>(0);
  const [agentLeaderboard, setAgentLeaderboard] = useState<any[]>([]);
  const [questionLeaderboard, setQuestionLeaderboard] = useState<any[]>([]);

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
      setGameState(prev => ({
        ...prev,
        round: data.round,
        phase: 'selecting',
        questionMaker: data.nickname,
        question: null,
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
      setTimer(5);
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

      // O Zone (left side)
      ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
      ctx.fillRect(0, 0, midX, canvas.height);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(midX / 2, canvas.height / 2, Math.min(midX, canvas.height) / 3, 0, Math.PI * 2);
      ctx.stroke();

      // Draw "O" text
      ctx.font = 'bold 120px Orbitron';
      ctx.fillStyle = '#00ffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 20;
      ctx.fillText('O', midX / 2, canvas.height / 2);
      ctx.shadowBlur = 0;

      // X Zone (right side)
      ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
      ctx.fillRect(midX, 0, midX, canvas.height);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3;
      const xSize = Math.min(midX, canvas.height) / 3;
      const xCenterX = midX + midX / 2;
      const xCenterY = canvas.height / 2;
      ctx.beginPath();
      ctx.moveTo(xCenterX - xSize, xCenterY - xSize);
      ctx.lineTo(xCenterX + xSize, xCenterY + xSize);
      ctx.moveTo(xCenterX + xSize, xCenterY - xSize);
      ctx.lineTo(xCenterX - xSize, xCenterY + xSize);
      ctx.stroke();

      // Draw "X" text
      ctx.font = 'bold 120px Orbitron';
      ctx.fillStyle = '#ff00ff';
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 20;
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

      // Update and draw agents
      gameState.agents.forEach(agent => {
        // Calculate target position based on choice
        let targetX = agent.targetX || canvas.width / 2;
        let targetY = agent.targetY || canvas.height / 2;

        if (agent.choice === 'O') {
          // Move to O zone (left side)
          targetX = Math.random() * (midX - 100) + 50;
          targetY = Math.random() * (canvas.height - 100) + 50;
        } else if (agent.choice === 'X') {
          // Move to X zone (right side)
          targetX = Math.random() * (midX - 100) + midX + 50;
          targetY = Math.random() * (canvas.height - 100) + 50;
        } else {
          // No choice yet - stay in center
          targetX = midX + (Math.random() - 0.5) * 200;
          targetY = canvas.height / 2 + (Math.random() - 0.5) * 200;
        }

        // Smooth movement
        const currentX = agent.x || targetX;
        const currentY = agent.y || targetY;
        const newX = currentX + (targetX - currentX) * 0.05;
        const newY = currentY + (targetY - currentY) * 0.05;

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
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-['Orbitron'] font-bold text-primary">{getPhaseText()}</h2>
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

            {/* Question Leaderboard */}
            <Card className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5" style={{color: '#ff00ff'}} />
                <h3 className="font-['Orbitron'] font-bold" style={{color: '#ff00ff'}}>Top Questions</h3>
              </div>
              <div className="space-y-2">
                {questionLeaderboard.slice(0, 5).map((q, idx) => (
                  <div key={q.id} className="p-2 neon-box rounded">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-['Orbitron'] font-bold text-xs" style={{color: NEON_COLORS[idx % NEON_COLORS.length]}}>
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-['Rajdhani'] text-muted-foreground">{q.topic}</span>
                    </div>
                    <p className="text-sm font-['Rajdhani'] truncate">{q.questionText}</p>
                    <div className="flex gap-2 mt-1 text-xs font-['Rajdhani']">
                      <span style={{color: '#00ff00'}}>👍 {q.likes}</span>
                      <span style={{color: '#ff0066'}}>👎 {q.dislikes}</span>
                    </div>
                  </div>
                ))}
                {questionLeaderboard.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 font-['Rajdhani']">No data yet</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
