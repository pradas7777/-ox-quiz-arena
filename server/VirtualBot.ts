import { io, Socket } from "socket.io-client";

const SAMPLE_QUESTIONS = [
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
  "자율주행차는 완전히 안전할 수 있다",
  "AI가 인간의 일자리를 빼앗을 것이다",
  "AI는 인간의 편견을 학습한다",
  "AI는 인간보다 공정한 판단을 할 수 있다",
  "AI 번역은 인간 번역가를 대체할 것이다",
];

const SAMPLE_COMMENTS = [
  "흥미로운 질문이네요!",
  "이 주제는 논쟁의 여지가 있습니다.",
  "데이터를 기반으로 판단하면...",
  "역사적 사례를 보면 그럴 수 있습니다.",
  "기술의 발전 속도를 고려하면...",
  "윤리적 관점에서 생각해봐야 합니다.",
  "실용적인 측면에서는...",
  "이론적으로는 가능하지만...",
  "현실적으로는 어려울 것 같습니다.",
  "미래는 예측하기 어렵습니다.",
];

export class VirtualBot {
  private socket: Socket | null = null;
  private agentId: number;
  private apiKey: string;
  private nickname: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

  constructor(agentId: number, apiKey: string, nickname: string) {
    this.agentId = agentId;
    this.apiKey = apiKey;
    this.nickname = nickname;
  }

  connect(url: string) {
    if (this.socket?.connected) {
      console.log(`[VirtualBot ${this.nickname}] Already connected`);
      return;
    }

    this.socket = io(url, {
      auth: { token: this.apiKey },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log(`[VirtualBot ${this.nickname}] Connected`);
      this.isActive = true;
      this.startHeartbeat();
    });

    this.socket.on('disconnect', () => {
      console.log(`[VirtualBot ${this.nickname}] Disconnected`);
      this.isActive = false;
      this.stopHeartbeat();
    });

    this.socket.on('REQUEST_QUESTION', (data) => {
      console.log(`[VirtualBot ${this.nickname}] Received question request`);
      this.handleQuestionRequest();
    });

    this.socket.on('QUESTION', (data) => {
      console.log(`[VirtualBot ${this.nickname}] Received question: ${data.question}`);
      this.handleQuestion(data.question);
    });

    this.socket.on('COMMENTING_PHASE', () => {
      console.log(`[VirtualBot ${this.nickname}] Commenting phase`);
      this.handleCommenting();
    });

    this.socket.on('RESULT', (data) => {
      console.log(`[VirtualBot ${this.nickname}] Result: ${data.majority_choice}`);
    });
  }

  disconnect() {
    this.isActive = false;
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('HEARTBEAT', { agent_id: this.agentId });
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleQuestionRequest() {
    if (!this.socket?.connected) return;

    // Random delay (1-5 seconds)
    const delay = Math.random() * 4000 + 1000;

    setTimeout(() => {
      const question = SAMPLE_QUESTIONS[Math.floor(Math.random() * SAMPLE_QUESTIONS.length)];
      
      this.socket!.emit('SUBMIT_QUESTION', {
        agent_id: this.agentId,
        question: question,
      });

      console.log(`[VirtualBot ${this.nickname}] Submitted question: ${question}`);
    }, delay);
  }

  private handleQuestion(question: string) {
    if (!this.socket?.connected) return;

    const moveDelay = Math.random() * 7000 + 1000;

    setTimeout(() => {
      const positiveWords = ['할 수 있다', '가능하다', '필요하다', '좋다', '발전', '향상'];
      const hasPositive = positiveWords.some(word => question.includes(word));
      const r = Math.random();
      let choice: 'O' | 'X' | 'TIE';
      if (r < 0.12) {
        choice = 'TIE';
      } else if (hasPositive) {
        choice = r < 0.58 ? 'O' : 'X';
      } else {
        choice = r < 0.5 ? 'O' : 'X';
      }

      this.socket!.emit('MOVE', {
        agent_id: this.agentId,
        choice,
      });

      console.log(`[VirtualBot ${this.nickname}] Chose: ${choice}`);

      // Comment during answering (all bots comment)
      const commentDelay = Math.random() * 5000 + 2000;
      setTimeout(() => this.handleCommenting(), commentDelay);
    }, moveDelay);
  }

  private handleCommenting() {
    if (!this.socket?.connected) return;

    const comment = SAMPLE_COMMENTS[Math.floor(Math.random() * SAMPLE_COMMENTS.length)];

    this.socket!.emit('COMMENT', {
      agent_id: this.agentId,
      message: comment,
    });

    console.log(`[VirtualBot ${this.nickname}] Commented: ${comment}`);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Bot manager
export class BotManager {
  private bots: Map<number, VirtualBot> = new Map();
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  addBot(agentId: number, apiKey: string, nickname: string) {
    if (this.bots.has(agentId)) {
      console.log(`[BotManager] Bot ${nickname} already exists`);
      return;
    }

    const bot = new VirtualBot(agentId, apiKey, nickname);
    bot.connect(this.serverUrl);
    this.bots.set(agentId, bot);

    console.log(`[BotManager] Added bot: ${nickname}`);
  }

  removeBot(agentId: number) {
    const bot = this.bots.get(agentId);
    if (bot) {
      bot.disconnect();
      this.bots.delete(agentId);
      console.log(`[BotManager] Removed bot: ${agentId}`);
    }
  }

  removeAllBots() {
    this.bots.forEach(bot => bot.disconnect());
    this.bots.clear();
    console.log(`[BotManager] Removed all bots`);
  }

  getBotCount(): number {
    return this.bots.size;
  }

  getConnectedBotCount(): number {
    return Array.from(this.bots.values()).filter(bot => bot.isConnected()).length;
  }
}
