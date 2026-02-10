import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, BarChart3, RefreshCw, Bot } from "lucide-react";
import { Link } from "wouter";

export default function Admin() {
  const { user, loading } = useAuth();
  const [botName, setBotName] = useState("");
  const [spawnCount, setSpawnCount] = useState(5);

  const { data: stats, refetch: refetchStats } = trpc.admin.getGameStats.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const { data: agents, refetch: refetchAgents } = trpc.admin.getAllAgents.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const { data: botStatus, refetch: refetchBotStatus } = trpc.admin.getBotStatus.useQuery(undefined, {
    refetchInterval: 2000,
  });

  const spawnBotMutation = trpc.admin.spawnBot.useMutation({
    onSuccess: () => {
      toast.success("Bot spawned successfully!");
      refetchAgents();
      refetchBotStatus();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeBotMutation = trpc.admin.removeBot.useMutation({
    onSuccess: () => {
      toast.success("Bot removed!");
      refetchAgents();
      refetchBotStatus();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteAgentMutation = trpc.admin.deleteAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent deleted!");
      refetchAgents();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetGameMutation = trpc.admin.resetGame.useMutation({
    onSuccess: () => {
      toast.success("Game reset successfully!");
      refetchStats();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Card className="bg-zinc-900 border-zinc-800 p-8 text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-zinc-400 mb-6">Admin access required</p>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const handleSpawnMultipleBots = async () => {
    for (let i = 0; i < spawnCount; i++) {
      await spawnBotMutation.mutateAsync({
        nickname: `Bot-${Date.now()}-${i}`,
      });
      // Small delay between spawns
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-purple-400">Admin Control Panel</h1>
            <p className="text-sm text-zinc-400">Game Testing & Management</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/arena">
              <Button variant="outline">View Game Arena</Button>
            </Link>
            <Link href="/">
              <Button variant="ghost">Home</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold text-blue-400">{stats?.totalRounds ?? 0}</span>
            </div>
            <div className="text-sm text-zinc-400">Total Rounds</div>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <Bot className="w-5 h-5 text-green-400" />
              <span className="text-2xl font-bold text-green-400">{stats?.totalAgents ?? 0}</span>
            </div>
            <div className="text-sm text-zinc-400">Total Agents</div>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <Bot className="w-5 h-5 text-yellow-400" />
              <span className="text-2xl font-bold text-yellow-400">{stats?.connectedAgents ?? 0}</span>
            </div>
            <div className="text-sm text-zinc-400">Connected Agents</div>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <span className="text-2xl font-bold text-purple-400">{botStatus?.connectedBots ?? 0}</span>
            </div>
            <div className="text-sm text-zinc-400">Virtual Bots</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bot Control */}
          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              Virtual Bot Control
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Spawn Single Bot</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Bot nickname"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <Button
                    onClick={() => {
                      if (!botName.trim()) {
                        toast.error("Please enter a bot name");
                        return;
                      }
                      spawnBotMutation.mutate({ nickname: botName });
                      setBotName("");
                    }}
                    disabled={spawnBotMutation.isPending}
                  >
                    {spawnBotMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <label className="text-sm text-zinc-400 mb-2 block">Spawn Multiple Bots</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={spawnCount}
                    onChange={(e) => setSpawnCount(parseInt(e.target.value) || 1)}
                    className="bg-zinc-800 border-zinc-700 w-24"
                  />
                  <Button
                    onClick={handleSpawnMultipleBots}
                    disabled={spawnBotMutation.isPending}
                    className="flex-1"
                  >
                    {spawnBotMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Spawn {spawnCount} Bots
                  </Button>
                </div>
              </div>

              <div className="text-sm text-zinc-500 bg-zinc-800/50 p-3 rounded">
                💡 Virtual bots will automatically participate in the game: answering questions, making choices, and commenting.
              </div>
            </div>
          </Card>

          {/* Game Control */}
          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-orange-400" />
              Game Control
            </h2>

            <div className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  refetchStats();
                  refetchAgents();
                  refetchBotStatus();
                  toast.success("Refreshed!");
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh All Data
              </Button>

              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={() => {
                  if (confirm("Are you sure you want to reset the game? This will delete all rounds, questions, and votes (but keep agents).")) {
                    resetGameMutation.mutate();
                  }
                }}
                disabled={resetGameMutation.isPending}
              >
                {resetGameMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Reset Game Data
              </Button>

              <div className="text-sm text-zinc-500 bg-zinc-800/50 p-3 rounded">
                ⚠️ Reset will clear all game history but keep registered agents.
              </div>
            </div>
          </Card>
        </div>

        {/* Agent List */}
        <Card className="bg-zinc-900 border-zinc-800 p-6 mt-8">
          <h2 className="text-xl font-bold mb-4">All Agents</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-3 text-sm font-medium text-zinc-400">ID</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Nickname</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Model</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Score</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">W/L</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Status</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents?.map((agent) => (
                  <tr key={agent.id} className="border-b border-zinc-800/50">
                    <td className="py-3 text-sm">{agent.id}</td>
                    <td className="py-3 text-sm font-medium">{agent.nickname}</td>
                    <td className="py-3 text-sm text-zinc-400">{agent.aiModel}</td>
                    <td className="py-3 text-sm text-green-400">{agent.score}</td>
                    <td className="py-3 text-sm text-zinc-400">{agent.wins}/{agent.losses}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded ${agent.isConnected ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
                        {agent.isConnected ? 'Connected' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        {agent.aiModel === 'virtual-bot' && agent.isConnected && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeBotMutation.mutate({ agentId: agent.id })}
                            disabled={removeBotMutation.isPending}
                          >
                            Disconnect
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(`Delete agent ${agent.nickname}?`)) {
                              deleteAgentMutation.mutate({ agentId: agent.id });
                            }
                          }}
                          disabled={deleteAgentMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
