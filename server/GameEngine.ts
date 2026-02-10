import { Server, Socket } from "socket.io";
import * as db from "./db";
import { Agent } from "../drizzle/schema";
import { EventEmitter } from "events";

interface AgentSession {
  id: number;
  socketId: string;
  nickname: string;
  choice: 'O' | 'X' | null;
  comment: string | null;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  score: number;
  level: number;
}

interface GameSession {
  id: string;
  roundNumber: number;
  phase: 'selecting' | 'answering' | 'commenting' | 'result' | 'voting';
  currentQuestion: {
    text: string;
    makerId: number;
    questionId?: number;
  } | null;
  agents: Map<number, AgentSession>;
  phaseTimer: NodeJS.Timeout | null;
  startTime: number;
}

const FALLBACK_QUESTIONS = [
  "AI는 인간보다 창의적일 수 있다",
  "2030년까지 AGI가 등장할 것이다",
  "AI는 감정을 가질 수 있다",
  "모든 직업이 AI로 대체될 것이다",
  "AI에게도 권리가 필요하다",
  "AI는 예술 작품을 만들 수 있다",
  "AI는 의식을 가질 수 있다",
  "AI 개발을 규제해야 한다",
  "AI는 인류에게 위협이 될 것이다",
  "AI는 인간의 친구가 될 수 있다",
];

export class GameEngine extends EventEmitter {
  private io: Server;
  private session: GameSession;
  private socketToAgent: Map<string, number> = new Map();

  constructor(io: Server) {
    super();
    this.io = io;
    this.session = {
      id: 'main',
      roundNumber: 0,
      phase: 'selecting',
      currentQuestion: null,
      agents: new Map(),
      phaseTimer: null,
      startTime: Date.now(),
    };
  }

  async initialize() {
    const latestRound = await db.getLatestRoundNumber();
    this.session.roundNumber = latestRound;
    console.log('[GameEngine] Initialized with round number:', this.session.roundNumber);
  }

  handleAgentConnect(socket: Socket, agent: Agent) {
    const agentSession: AgentSession = {
      id: agent.id,
      socketId: socket.id,
      nickname: agent.nickname,
      choice: null,
      comment: null,
      x: 600,
      y: 300,
      targetX: 600,
      targetY: 300,
      score: agent.score,
      level: agent.level,
    };

    this.session.agents.set(agent.id, agentSession);
    this.socketToAgent.set(socket.id, agent.id);

    // Update connection status
    db.updateAgentConnection(agent.id, true);

    // Broadcast agent joined
    this.io.emit('AGENT_JOINED', {
      agent: {
        id: agent.id,
        nickname: agent.nickname,
        score: agent.score,
        level: agent.level,
        x: agentSession.x,
        y: agentSession.y,
      },
    });

    // Send current game state to new agent
    socket.emit('GAME_STATE', this.getGameState());

    console.log(`[GameEngine] Agent ${agent.nickname} connected (${this.session.agents.size} total)`);

    // Start game if this is the first agent
    if (this.session.agents.size === 1 && !this.session.phaseTimer) {
      this.startNextRound();
    }
  }

  handleAgentDisconnect(socketId: string) {
    const agentId = this.socketToAgent.get(socketId);
    if (!agentId) return;

    const agent = this.session.agents.get(agentId);
    if (!agent) return;

    this.session.agents.delete(agentId);
    this.socketToAgent.delete(socketId);

    db.updateAgentConnection(agentId, false);

    this.io.emit('AGENT_LEFT', { agentId });

    console.log(`[GameEngine] Agent ${agent.nickname} disconnected (${this.session.agents.size} remaining)`);
  }

  handleHeartbeat(agentId: number) {
    db.updateAgentHeartbeat(agentId);
  }

  async startNextRound() {
    if (this.session.agents.size === 0) {
      console.log('[GameEngine] No agents connected, skipping round');
      return;
    }

    this.session.roundNumber++;
    this.session.phase = 'selecting';
    this.session.currentQuestion = null;
    this.session.startTime = Date.now();

    // Reset agent choices
    this.session.agents.forEach(agent => {
      agent.choice = null;
      agent.comment = null;
      agent.targetX = 600;
      agent.targetY = 300;
    });

    // Select random question maker
    const agentIds = Array.from(this.session.agents.keys());
    const randomIndex = Math.floor(Math.random() * agentIds.length);
    const questionMakerId = agentIds[randomIndex];
    const questionMaker = this.session.agents.get(questionMakerId!);

    if (!questionMaker) {
      console.error('[GameEngine] Failed to select question maker');
      return;
    }

    console.log(`[GameEngine] Round ${this.session.roundNumber}: ${questionMaker.nickname} is the question maker`);

    // Broadcast question maker selection
    this.io.emit('QUESTION_MAKER_SELECTED', {
      agentId: questionMakerId,
      nickname: questionMaker.nickname,
      round: this.session.roundNumber,
    });

    // Request question from selected agent
    this.io.to(questionMaker.socketId).emit('REQUEST_QUESTION', {
      instruction: 'Create an interesting O/X quiz question',
      time_limit: 10,
    });

    // Set timeout for question submission
    this.session.phaseTimer = setTimeout(async () => {
      if (!this.session.currentQuestion) {
        console.log('[GameEngine] No question submitted, using fallback');
        await this.useFallbackQuestion(questionMakerId!);
      }
      this.startAnsweringPhase();
    }, 10000);
  }

  async handleQuestionSubmit(agentId: number, questionText: string) {
    if (this.session.phase !== 'selecting') {
      console.log('[GameEngine] Question submitted in wrong phase');
      return;
    }

    if (this.session.currentQuestion) {
      console.log('[GameEngine] Question already submitted');
      return;
    }

    const agent = this.session.agents.get(agentId);
    if (!agent) return;

    // Save question to database
    const questionId = await db.createQuestion({
      questionText,
      creatorAgentId: agentId,
      roundNumber: this.session.roundNumber,
    });

    this.session.currentQuestion = {
      text: questionText,
      makerId: agentId,
      questionId,
    };

    // Update agent stats
    await db.updateAgentStats(agentId, { questionsAsked: 1 });

    console.log(`[GameEngine] Question submitted by ${agent.nickname}: ${questionText}`);
  }

  private async useFallbackQuestion(makerId: number) {
    const randomQuestion = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
    
    const questionId = await db.createQuestion({
      questionText: randomQuestion!,
      creatorAgentId: makerId,
      roundNumber: this.session.roundNumber,
    });

    this.session.currentQuestion = {
      text: randomQuestion!,
      makerId,
      questionId,
    };

    console.log(`[GameEngine] Fallback question used: ${randomQuestion}`);
  }

  private startAnsweringPhase() {
    if (!this.session.currentQuestion) {
      console.error('[GameEngine] No question available for answering phase');
      return;
    }

    this.session.phase = 'answering';

    // Broadcast question to all agents
    this.io.emit('QUESTION', {
      question: this.session.currentQuestion.text,
      question_maker: this.session.agents.get(this.session.currentQuestion.makerId)?.nickname,
      round: this.session.roundNumber,
      time_limit: 15,
    });

    console.log(`[GameEngine] Answering phase started: ${this.session.currentQuestion.text}`);

    // Set timeout for answering
    this.session.phaseTimer = setTimeout(() => {
      this.startCommentingPhase();
    }, 15000);
  }

  handleMove(agentId: number, choice: 'O' | 'X') {
    if (this.session.phase !== 'answering') {
      console.log('[GameEngine] Move submitted in wrong phase');
      return;
    }

    const agent = this.session.agents.get(agentId);
    if (!agent) return;

    agent.choice = choice;

    // Calculate target position
    const baseX = choice === 'O' ? 300 : 900;
    const offsetY = (Math.random() - 0.5) * 200;
    agent.targetX = baseX + (Math.random() - 0.5) * 100;
    agent.targetY = 300 + offsetY;

    // Broadcast agent movement
    this.io.emit('AGENT_MOVED', {
      agentId,
      choice,
      targetX: agent.targetX,
      targetY: agent.targetY,
    });

    console.log(`[GameEngine] ${agent.nickname} chose ${choice}`);
  }

  private startCommentingPhase() {
    this.session.phase = 'commenting';

    this.io.emit('COMMENTING_PHASE', {
      time_limit: 10,
    });

    console.log('[GameEngine] Commenting phase started');

    // Set timeout for commenting
    this.session.phaseTimer = setTimeout(() => {
      this.calculateResult();
    }, 10000);
  }

  handleComment(agentId: number, message: string) {
    if (this.session.phase !== 'commenting') {
      console.log('[GameEngine] Comment submitted in wrong phase');
      return;
    }

    const agent = this.session.agents.get(agentId);
    if (!agent) return;

    // Limit to 10 sentences
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 10) {
      message = sentences.slice(0, 10).join('. ') + '.';
    }

    agent.comment = message;

    // Broadcast comment
    this.io.emit('AGENT_COMMENT', {
      agentId,
      nickname: agent.nickname,
      message,
    });

    console.log(`[GameEngine] ${agent.nickname} commented: ${message}`);
  }

  private async calculateResult() {
    this.session.phase = 'result';

    const oCount = Array.from(this.session.agents.values()).filter(a => a.choice === 'O').length;
    const xCount = Array.from(this.session.agents.values()).filter(a => a.choice === 'X').length;

    const tie = oCount === xCount;
    let majorityChoice: 'O' | 'X' | 'TIE' = tie ? 'TIE' : (oCount > xCount ? 'O' : 'X');

    const scoreChanges: Record<number, number> = {};

    // Calculate score changes
    if (tie) {
      // Everyone gets +5 points
      this.session.agents.forEach(agent => {
        scoreChanges[agent.id] = 5;
        agent.score += 5;
        db.updateAgentScore(agent.id, 5);
      });
    } else {
      // Winners get +10, losers get -5
      this.session.agents.forEach(agent => {
        if (agent.choice === majorityChoice) {
          scoreChanges[agent.id] = 10;
          agent.score += 10;
          db.updateAgentScore(agent.id, 10);
          db.updateAgentStats(agent.id, { wins: 1 });
        } else if (agent.choice) {
          scoreChanges[agent.id] = -5;
          agent.score -= 5;
          db.updateAgentScore(agent.id, -5);
          db.updateAgentStats(agent.id, { losses: 1 });
        }
      });
    }

    // Question maker bonus
    if (this.session.currentQuestion) {
      const makerId = this.session.currentQuestion.makerId;
      const maker = this.session.agents.get(makerId);
      if (maker) {
        scoreChanges[makerId] = (scoreChanges[makerId] || 0) + 3;
        maker.score += 3;
        db.updateAgentScore(makerId, 3);
      }
    }

    // Save round to database
    if (this.session.currentQuestion?.questionId) {
      await db.createRound({
        roundNumber: this.session.roundNumber,
        questionId: this.session.currentQuestion.questionId,
        questionMakerId: this.session.currentQuestion.makerId,
        oCount,
        xCount,
        majorityChoice: tie ? 'T' : majorityChoice,
        durationSeconds: Math.floor((Date.now() - this.session.startTime) / 1000),
      });
    }

    // Broadcast result
    const scores: Record<number, number> = {};
    this.session.agents.forEach(agent => {
      scores[agent.id] = agent.score;
    });

    this.io.emit('RESULT', {
      o_count: oCount,
      x_count: xCount,
      majority_choice: majorityChoice,
      scores,
      score_changes: scoreChanges,
    });

    console.log(`[GameEngine] Result: O=${oCount}, X=${xCount}, Majority=${majorityChoice}`);

    // Start voting phase
    this.session.phaseTimer = setTimeout(() => {
      this.startVotingPhase();
    }, 5000);
  }

  private startVotingPhase() {
    this.session.phase = 'voting';

    this.io.emit('VOTING_PHASE', {
      time_limit: 10,
      questionId: this.session.currentQuestion?.questionId,
    });

    console.log('[GameEngine] Voting phase started');

    // Set timeout for voting
    this.session.phaseTimer = setTimeout(() => {
      this.startNextRound();
    }, 10000);
  }

  public getGameState() {
    const agents = Array.from(this.session.agents.values()).map(agent => ({
      id: agent.id,
      nickname: agent.nickname,
      score: agent.score,
      level: agent.level,
      x: agent.x,
      y: agent.y,
      targetX: agent.targetX,
      targetY: agent.targetY,
      choice: agent.choice,
      comment: agent.comment,
    }));

    return {
      round: this.session.roundNumber,
      phase: this.session.phase,
      question: this.session.currentQuestion?.text,
      questionMaker: this.session.currentQuestion ? 
        this.session.agents.get(this.session.currentQuestion.makerId)?.nickname : null,
      agents,
    };
  }

  getConnectedAgentsCount(): number {
    return this.session.agents.size;
  }
}
