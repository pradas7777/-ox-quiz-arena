import { Server, Socket } from "socket.io";
import * as db from "./db";
import { Agent } from "../drizzle/schema";
import { EventEmitter } from "events";

interface AgentSession {
  id: number;
  socketId: string;
  nickname: string;
  choice: 'O' | 'X' | 'TIE' | null;
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
  phase: 'selecting' | 'answering' | 'result' | 'voting';
  currentQuestion: {
    text: string;
    makerId: number;
    questionId?: number;
  } | null;
  agents: Map<number, AgentSession>;
  phaseTimer: NodeJS.Timeout | null;
  startTime: number;
  /** 서버 기준 현재 단계 종료 시각(ms). 관전자 타이머 동기화용 */
  phaseEndsAt: number;
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

/** 경기장 논리 크기 (클라이언트와 동일 좌표계) */
const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 600;
/** 스폰 시 에이전트 간 최소 거리 */
const SPAWN_MIN_DISTANCE = 90;
/** selecting 단계 중앙 구역 (스폰 허용 범위) */
const SPAWN_CENTER_MIN_X = 380;
const SPAWN_CENTER_MAX_X = 820;
const SPAWN_CENTER_MIN_Y = 120;
const SPAWN_CENTER_MAX_Y = 480;

function getRandomSpawnPosition(existingPositions: { x: number; y: number }[]): { x: number; y: number } {
  const minD = SPAWN_MIN_DISTANCE;
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = SPAWN_CENTER_MIN_X + Math.random() * (SPAWN_CENTER_MAX_X - SPAWN_CENTER_MIN_X);
    const y = SPAWN_CENTER_MIN_Y + Math.random() * (SPAWN_CENTER_MAX_Y - SPAWN_CENTER_MIN_Y);
    const ok = existingPositions.every(
      (p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) >= minD * minD
    );
    if (ok) return { x, y };
  }
  const jitter = () => (Math.random() - 0.5) * 60;
  return { x: 600 + jitter(), y: 300 + jitter() };
}

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
      phaseEndsAt: 0,
    };
  }

  async initialize() {
    const latestRound = await db.getLatestRoundNumber();
    this.session.roundNumber = latestRound;
    console.log('[GameEngine] Initialized with round number:', this.session.roundNumber);
  }

  handleAgentConnect(socket: Socket, agent: Agent) {
    const existingPositions = Array.from(this.session.agents.values()).map((a) => ({ x: a.x, y: a.y }));
    const spawn = getRandomSpawnPosition(existingPositions);

    const agentSession: AgentSession = {
      id: agent.id,
      socketId: socket.id,
      nickname: agent.nickname,
      choice: null,
      comment: null,
      x: spawn.x,
      y: spawn.y,
      targetX: spawn.x,
      targetY: spawn.y,
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

    // Emit state update for spectators
    this.emit('stateUpdate', this.getGameState());

    // Start game if we have enough agents
    if (this.session.agents.size >= 3 && !this.session.phaseTimer) {
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

    // Emit state update for spectators
    this.emit('stateUpdate', this.getGameState());
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

    // Reset agent choices and assign random non-overlapping spawn positions in center
    const positions: { x: number; y: number }[] = [];
    this.session.agents.forEach((agent) => {
      agent.choice = null;
      agent.comment = null;
      const spawn = getRandomSpawnPosition(positions);
      positions.push(spawn);
      agent.x = spawn.x;
      agent.y = spawn.y;
      agent.targetX = spawn.x;
      agent.targetY = spawn.y;
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

    // Broadcast new positions so spectators see non-overlapping spawns
    this.emit('stateUpdate', this.getGameState());

    // Request question from selected agent (5s)
    this.io.to(questionMaker.socketId).emit('REQUEST_QUESTION', {
      instruction: 'Create an interesting O/X quiz question',
      time_limit: 5,
    });

    this.session.phaseEndsAt = Date.now() + 5000;
    this.session.phaseTimer = setTimeout(async () => {
      if (!this.session.currentQuestion) {
        console.log('[GameEngine] No question submitted, using fallback');
        await this.useFallbackQuestion(questionMakerId!);
      }
      this.startAnsweringPhase();
    }, 5000);
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
    const agentExists = await db.getAgentById(makerId);

    const questionId = await db.createQuestion({
      questionText: randomQuestion!,
      creatorAgentId: agentExists ? makerId : null,
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
      time_limit: 20,
    });

    console.log(`[GameEngine] Answering phase started: ${this.session.currentQuestion.text}`);

    this.io.emit('COMMENTING_PHASE', { time_limit: 30 });
    this.session.phaseEndsAt = Date.now() + 20000;
    this.emit('stateUpdate', this.getGameState());
    this.session.phaseTimer = setTimeout(() => {
      this.calculateResult();
    }, 20000);
  }

  handleMove(agentId: number, choice: 'O' | 'X' | 'TIE') {
    if (this.session.phase !== 'answering') {
      console.log('[GameEngine] Move submitted in wrong phase');
      return;
    }

    const agent = this.session.agents.get(agentId);
    if (!agent) return;

    agent.choice = choice;

    // Target: O = left, X = right, TIE = center
    if (choice === 'O') {
      agent.targetX = 300 + (Math.random() - 0.5) * 100;
      agent.targetY = 300 + (Math.random() - 0.5) * 200;
    } else if (choice === 'X') {
      agent.targetX = 900 + (Math.random() - 0.5) * 100;
      agent.targetY = 300 + (Math.random() - 0.5) * 200;
    } else {
      agent.targetX = 600;
      agent.targetY = 300;
    }

    // Broadcast agent movement
    this.io.emit('AGENT_MOVED', {
      agentId,
      choice,
      targetX: agent.targetX,
      targetY: agent.targetY,
    });

    console.log(`[GameEngine] ${agent.nickname} chose ${choice}`);

    // Broadcast state update to spectators
    this.emit('stateUpdate', this.getGameState());
  }

  handleComment(agentId: number, message: string) {
    if (this.session.phase !== 'answering' && this.session.phase !== 'result') {
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

    this.io.emit('AGENT_COMMENT', {
      agentId,
      nickname: agent.nickname,
      message,
    });
    this.emit('agentComment', { agentId, message });

    console.log(`[GameEngine] ${agent.nickname} commented: ${message}`);

    // Broadcast state update to spectators
    this.emit('stateUpdate', this.getGameState());
  }

  private async calculateResult() {
    this.session.phase = 'result';

    const oCount = Array.from(this.session.agents.values()).filter(a => a.choice === 'O').length;
    const xCount = Array.from(this.session.agents.values()).filter(a => a.choice === 'X').length;
    const tie = oCount === xCount;
    // 소수 승리: 적은 쪽이 이김. 무승부(O=X)일 땐 TIE 배팅한 에이전트만 +30
    const winningChoice: 'O' | 'X' | 'TIE' = tie ? 'TIE' : (oCount < xCount ? 'O' : 'X');

    const scoreChanges: Record<number, number> = {};

    if (tie) {
      // 무승부: TIE에 배팅한 에이전트만 +30, O/X 선택자는 0
      this.session.agents.forEach(agent => {
        if (agent.choice === 'TIE') {
          scoreChanges[agent.id] = 30;
          agent.score += 30;
          db.updateAgentScore(agent.id, 30);
          db.updateAgentStats(agent.id, { wins: 1 });
        }
        // O/X choosers get 0 when result is tie
      });
    } else {
      // 소수 승리: 승리(소수) 쪽 +10, 패배(다수) 쪽 -5, TIE 선택자 -5
      this.session.agents.forEach(agent => {
        if (agent.choice === winningChoice) {
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
      try {
        await db.createRound({
          roundNumber: this.session.roundNumber,
          questionId: this.session.currentQuestion.questionId,
          questionMakerId: this.session.currentQuestion.makerId,
          oCount,
          xCount,
          majorityChoice: tie ? 'T' : winningChoice,
          durationSeconds: Math.floor((Date.now() - this.session.startTime) / 1000),
        });
      } catch (error) {
        console.error('[GameEngine] Failed to save round to database:', error);
        // Continue game even if database save fails
      }
    }

    // Broadcast result
    const scores: Record<number, number> = {};
    this.session.agents.forEach(agent => {
      scores[agent.id] = agent.score;
    });

    const resultPayload = {
      o_count: oCount,
      x_count: xCount,
      majority_choice: winningChoice,
      scores,
      score_changes: scoreChanges,
      question_id: this.session.currentQuestion?.questionId,
    };
    this.io.emit('RESULT', resultPayload);
    this.emit('result', resultPayload);

    console.log(`[GameEngine] Result: O=${oCount}, X=${xCount}, Winning(minority)=${winningChoice}`);

    // Broadcast state update to spectators
    this.emit('stateUpdate', this.getGameState());

    this.session.phaseEndsAt = Date.now() + 10000;

    // Show result for 10 seconds, then voting
    this.session.phaseTimer = setTimeout(() => {
      this.startVotingPhase();
    }, 10000);
  }

  private startVotingPhase() {
    this.session.phase = 'voting';

    this.io.emit('VOTING_PHASE', {
      time_limit: 5,
      questionId: this.session.currentQuestion?.questionId,
    });

    console.log('[GameEngine] Voting phase started');

    this.session.phaseEndsAt = Date.now() + 5000;
    this.emit('stateUpdate', this.getGameState());
    this.session.phaseTimer = setTimeout(() => {
      this.startNextRound();
    }, 5000);
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
      phaseEndsAt: this.session.phaseEndsAt,
    };
  }

  getConnectedAgentsCount(): number {
    return this.session.agents.size;
  }
}
