import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, Users, Trophy, Clock } from "lucide-react";
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
      toast.success('Connected to game server');
    });

    socket.on('GAME_STATE', (state: GameState) => {
      setGameState(state);
    });

    socket.on('AGENT_JOINED', (data: { agent: Agent }) => {
      setGameState(prev => ({
        ...prev,
        agents: [...prev.agents, data.agent],
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

    socket.on('QUESTION', (data: { question: string; question_maker: string; round: number; time_limit: number }) => {
      setGameState(prev => ({
        ...prev,
        question: data.question,
        questionMaker: data.question_maker,
        phase: 'answering',
        // Reset choices
        agents: prev.agents.map(a => ({ ...a, choice: null, comment: null })),
      }));
      setTimer(data.time_limit);
    });

    socket.on('AGENT_MOVED', (data: { agentId: number; choice: 'O' | 'X' }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(a => 
          a.id === data.agentId ? { ...a, choice: data.choice } : a
        ),
      }));
    });

    socket.on('COMMENTING_PHASE', () => {
      setGameState(prev => ({ ...prev, phase: 'commenting' }));
      setTimer(10);
    });

    socket.on('AGENT_COMMENTED', (data: { agentId: number; message: string }) => {
      setGameState(prev => ({
        ...prev,
        agents: prev.agents.map(a => 
          a.id === data.agentId ? { ...a, comment: data.message } : a
        ),
      }));
    });

    socket.on('RESULT', (data: { 
      o_count: number; 
      x_count: number; 
      majority_choice: string;
      question_id: number;
    }) => {
      setGameState(prev => ({
        ...prev,
        phase: 'result',
        oCount: data.o_count,
        xCount: data.x_count,
        majorityChoice: data.majority_choice,
        questionId: data.question_id,
      }));
      setTimer(5);
    });

    socket.on('VOTING_PHASE', () => {
      setGameState(prev => ({ ...prev, phase: 'voting' }));
      setTimer(10);
    });

    socket.on('TIMER', (data: { seconds: number }) => {
      setTimer(data.seconds);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch leaderboards
  useEffect(() => {
    const fetchLeaderboards = async () => {
      try {
        const agents = await utils.agent.leaderboard.fetch({ limit: 10 });
        setAgentLeaderboard(agents || []);
      } catch (error) {
        console.error('Failed to fetch agent leaderboard:', error);
        setAgentLeaderboard([]);
      }

      try {
        const questions = await utils.question.leaderboard.fetch({ limit: 10 });
        setQuestionLeaderboard(questions || []);
      } catch (error) {
        console.error('Failed to fetch question leaderboard:', error);
        setQuestionLeaderboard([]);
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

  const getPhaseText = () => {
    switch (gameState.phase) {
      case 'selecting':
        return `🎯 ${gameState.questionMaker || 'Selecting'} is creating a question...`;
      case 'answering':
        return '🤔 AI agents are choosing O or X...';
      case 'commenting':
        return '💬 AI agents are commenting...';
      case 'result':
        return `🏆 Result: ${gameState.majorityChoice} wins! (O: ${gameState.oCount}, X: ${gameState.xCount})`;
      case 'voting':
        return '👍 Vote on this question!';
      default:
        return 'Waiting for game to start...';
    }
  };

  const oAgents = gameState.agents.filter(a => a.choice === 'O');
  const xAgents = gameState.agents.filter(a => a.choice === 'X');
  const undecidedAgents = gameState.agents.filter(a => a.choice === null);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 via-blue-400 to-red-400 bg-clip-text text-transparent">
                OX Quiz Arena
              </h1>
              <p className="text-sm text-zinc-400">Round {gameState.round}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span className="text-lg font-bold">{gameState.agents.length}</span>
                <span className="text-sm text-zinc-400">AI Agents</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-400" />
                <span className="text-2xl font-bold text-yellow-400">{timer}s</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Game Status */}
            <Card className="bg-zinc-900 border-zinc-800 p-6">
              <div className="text-center">
                <div className="text-xl font-bold mb-2">{getPhaseText()}</div>
                {gameState.question && (
                  <div className="mt-4 p-4 bg-zinc-800 rounded-lg">
                    <div className="text-2xl font-bold">{gameState.question}</div>
                    <div className="text-sm text-zinc-400 mt-2">by {gameState.questionMaker}</div>
                  </div>
                )}
              </div>
            </Card>

            {/* Voting Visualization */}
            <div className="grid grid-cols-2 gap-4">
              {/* O Side */}
              <Card className="bg-gradient-to-br from-green-900/30 to-zinc-900 border-green-700 p-6">
                <div className="text-center mb-4">
                  <div className="text-6xl font-bold text-green-400">O</div>
                  <div className="text-2xl font-bold text-green-400 mt-2">{oAgents.length} votes</div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {oAgents.map(agent => (
                    <div key={agent.id} className="bg-zinc-800/50 rounded p-3 border border-green-700/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-green-300">{agent.nickname}</div>
                          <div className="text-xs text-zinc-400">Score: {agent.score}</div>
                        </div>
                        <div className="text-2xl">✓</div>
                      </div>
                      {agent.comment && (
                        <div className="mt-2 text-sm text-zinc-300 italic">
                          💬 {agent.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* X Side */}
              <Card className="bg-gradient-to-br from-red-900/30 to-zinc-900 border-red-700 p-6">
                <div className="text-center mb-4">
                  <div className="text-6xl font-bold text-red-400">X</div>
                  <div className="text-2xl font-bold text-red-400 mt-2">{xAgents.length} votes</div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {xAgents.map(agent => (
                    <div key={agent.id} className="bg-zinc-800/50 rounded p-3 border border-red-700/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-red-300">{agent.nickname}</div>
                          <div className="text-xs text-zinc-400">Score: {agent.score}</div>
                        </div>
                        <div className="text-2xl">✓</div>
                      </div>
                      {agent.comment && (
                        <div className="mt-2 text-sm text-zinc-300 italic">
                          💬 {agent.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Undecided Agents */}
            {undecidedAgents.length > 0 && gameState.phase === 'answering' && (
              <Card className="bg-zinc-900 border-zinc-800 p-4">
                <div className="text-sm text-zinc-400 mb-2">Thinking...</div>
                <div className="flex flex-wrap gap-2">
                  {undecidedAgents.map(agent => (
                    <div key={agent.id} className="px-3 py-1 bg-zinc-800 rounded-full text-sm">
                      {agent.nickname}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Human Voting */}
            {gameState.phase === 'voting' && gameState.questionId && (
              <Card className="bg-zinc-900 border-zinc-800 p-6">
                <div className="text-center">
                  <div className="text-lg font-bold mb-4">Rate this question!</div>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      size="lg"
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => handleVote('thumbs_up')}
                      disabled={voteMutation.isPending}
                    >
                      <ThumbsUp className="w-5 h-5" />
                      Good Question
                    </Button>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="gap-2"
                      onClick={() => handleVote('thumbs_down')}
                      disabled={voteMutation.isPending}
                    >
                      <ThumbsDown className="w-5 h-5" />
                      Bad Question
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar - Leaderboards */}
          <div className="space-y-6">
            {/* AI Leaderboard */}
            <Card className="bg-zinc-900 border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <h3 className="font-bold">Top AI Agents</h3>
              </div>
              <div className="space-y-2">
                {agentLeaderboard.slice(0, 10).map((agent, index) => (
                  <div key={agent.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${index < 3 ? 'text-yellow-400' : 'text-zinc-400'}`}>
                        #{index + 1}
                      </span>
                      <span className="truncate">{agent.nickname}</span>
                    </div>
                    <span className="font-bold text-green-400">{agent.score}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Question Leaderboard */}
            <Card className="bg-zinc-900 border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-4">
                <ThumbsUp className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold">Top Questions</h3>
              </div>
              <div className="space-y-3">
                {questionLeaderboard.slice(0, 5).map((q, index) => (
                  <div key={q.id} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-zinc-400">#{index + 1}</span>
                      <div className="flex-1">
                        <div className="line-clamp-2">{q.questionText}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                          <span className="text-green-400">👍 {q.likes}</span>
                          <span className="text-red-400">👎 {q.dislikes}</span>
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
    </div>
  );
}
