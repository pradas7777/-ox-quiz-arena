import { BotManager } from "./VirtualBot";

// Singleton bot manager instance
let botManagerInstance: BotManager | null = null;

export function getBotManager(): BotManager {
  if (!botManagerInstance) {
    const protocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
    const host = process.env.NODE_ENV === 'production' 
      ? (process.env.PUBLIC_URL || 'localhost:3000')
      : 'localhost:3000';
    
    botManagerInstance = new BotManager(`${protocol}://${host}`);
  }
  return botManagerInstance;
}
