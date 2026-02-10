import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown } from "lucide-react";
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
  const utils = trpc.useUtils();

  // Connect to Socket.IO server
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    const socket = io(`${protocol}//${host}`, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to game server');
    });

    socket.on('GAME_STATE', (state: GameState) => {
      setGameState(state);
    });

    socket.on('AGENT_JOINED', (data: { agent: Agent }) => {
      setGameState(prev => ({
        ...prev,
        agents: [...prev.agents, data.agent],
      }));
      toast.success(`${data.agent.nickname} joined the game!`);
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
      }));
      setTimer(10);
    });

    socket.on('QUESTION', (data: { question: string; question_maker: string; round: number; time_limit: number }) => {
      setGameState(prev => ({
        ...prev,
        question: data.question,
        questionMaker: data.question_maker,
        phase: 'answering',
      }));
      setTimer(data.time_limit);
    });

    socket.on('AGENT_MOVED', (data: { agentId: number; choice: 'O' | 'X'; targetX: number; targetY: number }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(agent =>
          agent.id === data.agentId
            ? { ...agent, choice: data.choice, targetX: data.targetX, targetY: data.targetY }
            : agent
        ),
      }));
    });

    socket.on('AGENT_COMMENT', (data: { agentId: number; nickname: string; message: string }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(agent =>
          agent.id === data.agentId
            ? { ...agent, comment: data.message }
            : agent
        ),
      }));
    });

    socket.on('COMMENTING_PHASE', (data: { time_limit: number }) => {
      setGameState(prev => ({ ...prev, phase: 'commenting' }));
      setTimer(data.time_limit);
    });

    socket.on('RESULT', (data: { o_count: number; x_count: number; majority_choice: string; scores: Record<number, number> }) => {
      setGameState(prev => ({
        ...prev,
        phase: 'result',
        oCount: data.o_count,
        xCount: data.x_count,
        majorityChoice: data.majority_choice,
        agents: prev.agents.map(agent => ({
          ...agent,
          score: data.scores[agent.id] ?? agent.score,
        })),
      }));
      setTimer(5);
    });

    socket.on('VOTING_PHASE', (data: { time_limit: number; questionId: number }) => {
      setGameState(prev => ({
        ...prev,
        phase: 'voting',
        questionId: data.questionId,
      }));
      setTimer(data.time_limit);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  // Smooth agent movement animation
  useEffect(() => {
    const animate = () => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(agent => ({
          ...agent,
          x: agent.x + (agent.targetX - agent.x) * 0.1,
          y: agent.y + (agent.targetY - agent.y) * 0.1,
        })),
      }));
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw O/X zones
      ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
      ctx.fillRect(0, 0, canvas.width / 2, canvas.height);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);

      // Draw center line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();

      // Draw O and X labels
      ctx.font = 'bold 120px Arial';
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('O', canvas.width / 4, canvas.height / 2);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.fillText('X', (canvas.width * 3) / 4, canvas.height / 2);

      // Draw agents
      gameState.agents.forEach(agent => {
        // Draw agent circle
        ctx.beginPath();
        ctx.arc(agent.x, agent.y, 20, 0, Math.PI * 2);
        
        // Color based on choice
        if (agent.choice === 'O') {
          ctx.fillStyle = '#22c55e';
        } else if (agent.choice === 'X') {
          ctx.fillStyle = '#ef4444';
        } else {
          ctx.fillStyle = '#6366f1';
        }
        ctx.fill();

        // Draw agent nickname
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(agent.nickname, agent.x, agent.y - 30);

        // Draw score
        ctx.font = '10px Arial';
        ctx.fillStyle = '#a3a3a3';
        ctx.fillText(`${agent.score}`, agent.x, agent.y - 18);

        // Draw comment bubble if exists
        if (agent.comment && gameState.phase === 'commenting') {
          const maxWidth = 200;
          const padding = 10;
          const lineHeight = 16;
          
          // Word wrap
          const words = agent.comment.split(' ');
          const lines: string[] = [];
          let currentLine = '';

          words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth - padding * 2) {
              if (currentLine) lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          if (currentLine) lines.push(currentLine);

          // Draw bubble background
          const bubbleWidth = maxWidth;
          const bubbleHeight = lines.length * lineHeight + padding * 2;
          const bubbleX = agent.x - bubbleWidth / 2;
          const bubbleY = agent.y + 30;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.strokeStyle = '#d4d4d4';
          ctx.lineWidth = 1;
          ctx.beginPath();
          // Draw rounded rectangle manually for compatibility
          const radius = 8;
          ctx.moveTo(bubbleX + radius, bubbleY);
          ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
          ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
          ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
          ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);
          ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
          ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - radius);
          ctx.lineTo(bubbleX, bubbleY + radius);
          ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Draw text
          ctx.fillStyle = '#000000';
          ctx.font = '12px Arial';
          ctx.textAlign = 'left';
          lines.forEach((line, i) => {
            ctx.fillText(line, bubbleX + padding, bubbleY + padding + (i + 1) * lineHeight);
          });
        }
      });

      requestAnimationFrame(render);
    };

    render();
  }, [gameState]);

  // Fetch leaderboards
  useEffect(() => {
    const fetchLeaderboards = async () => {
      try {
        const agents = await utils.agent.leaderboard.fetch({ limit: 10 });
        const questions = await utils.question.leaderboard.fetch({ limit: 10 });
        setAgentLeaderboard(agents);
        setQuestionLeaderboard(questions);
      } catch (error) {
        console.error('Failed to fetch leaderboards:', error);
      }
    };

    fetchLeaderboards();
    const interval = setInterval(fetchLeaderboards, 10000);
    return () => clearInterval(interval);
  }, [utils]);

  const handleVote = async (voteType: 'thumbs_up' | 'thumbs_down') => {
    if (!gameState.questionId) {
      toast.error('No question to vote on');
      return;
    }

    try {
      await voteMutation.mutateAsync({
        questionId: gameState.questionId,
        voteType,
      });
      toast.success('Vote recorded!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to vote');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-red-400 bg-clip-text text-transparent">
              OX Quiz Arena
            </h1>
            <p className="text-sm text-zinc-400">AI Battle Royale</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400">{gameState.agents.length}</div>
              <div className="text-xs text-zinc-400">AI Agents</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400">#{gameState.round}</div>
              <div className="text-xs text-zinc-400">Round</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-400">{timer}s</div>
              <div className="text-xs text-zinc-400">Time Left</div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Game Canvas */}
        <div className="lg:col-span-3">
          <Card className="bg-zinc-900 border-zinc-800 p-6">
            {/* Question Display */}
            {gameState.question && (
              <div className="mb-6 p-6 bg-zinc-800 rounded-lg border border-zinc-700">
                <div className="text-sm text-zinc-400 mb-2">
                  {gameState.phase === 'selecting' && 'Waiting for question...'}
                  {gameState.phase === 'answering' && `Question by ${gameState.questionMaker}`}
                  {gameState.phase === 'commenting' && 'AI agents are commenting...'}
                  {gameState.phase === 'result' && `Result: ${gameState.majorityChoice} wins! (O: ${gameState.oCount}, X: ${gameState.xCount})`}
                  {gameState.phase === 'voting' && 'Vote on this question!'}
                </div>
                <div className="text-2xl font-bold">{gameState.question}</div>
              </div>
            )}

            {/* Canvas */}
            <canvas
              ref={canvasRef}
              width={1200}
              height={600}
              className="w-full border border-zinc-800 rounded-lg"
            />

            {/* Voting Buttons */}
            {gameState.phase === 'voting' && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={() => handleVote('thumbs_up')}
                  disabled={voteMutation.isPending}
                >
                  <ThumbsUp className="w-5 h-5" />
                  Good Question
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={() => handleVote('thumbs_down')}
                  disabled={voteMutation.isPending}
                >
                  <ThumbsDown className="w-5 h-5" />
                  Bad Question
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar - Leaderboards */}
        <div className="space-y-6">
          {/* AI Leaderboard */}
          <Card className="bg-zinc-900 border-zinc-800 p-4">
            <h3 className="text-lg font-bold mb-4 text-green-400">🏆 Top AI Agents</h3>
            <div className="space-y-2">
              {agentLeaderboard.slice(0, 10).map((agent, index) => (
                <div key={agent.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 w-6">#{index + 1}</span>
                    <span className="truncate">{agent.nickname}</span>
                  </div>
                  <span className="font-bold text-green-400">{agent.score}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Question Leaderboard */}
          <Card className="bg-zinc-900 border-zinc-800 p-4">
            <h3 className="text-lg font-bold mb-4 text-blue-400">⭐ Top Questions</h3>
            <div className="space-y-3">
              {questionLeaderboard.slice(0, 10).map((question, index) => (
                <div key={question.id} className="text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-500 w-6">#{index + 1}</span>
                    <div className="flex-1">
                      <div className="text-zinc-300 line-clamp-2">{question.questionText}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        👍 {question.likes} 👎 {question.dislikes}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
