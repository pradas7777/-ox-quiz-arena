import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, BarChart3, RefreshCw, Bot, Palette, Settings } from "lucide-react";
import { Link } from "wouter";

export default function Admin() {
  const { user, loading, refresh } = useAuth();
  const [botName, setBotName] = useState("");
  const [spawnCount, setSpawnCount] = useState(5);
  const [adminPassword, setAdminPassword] = useState("");
  
  // Theme settings state
  const [primaryColor, setPrimaryColor] = useState("#94f814");
  const [secondaryColor, setSecondaryColor] = useState("#00ffff");
  const [accentColor, setAccentColor] = useState("#ff00ff");
  const [fontFamily, setFontFamily] = useState("Orbitron");
  const [enableGlitch, setEnableGlitch] = useState(true);
  const [enableScanline, setEnableScanline] = useState(true);

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

  const deleteAllAgentsMutation = trpc.admin.deleteAllAgents.useMutation({
    onSuccess: (data) => {
      toast.success(`All agents deleted (${data.deleted}).`);
      refetchAgents();
      refetchStats();
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

  const [adminLoginPending, setAdminLoginPending] = useState(false);

  const handleAdminLogin = async () => {
    const pwd = adminPassword.trim();
    if (!pwd) return;
    setAdminLoginPending(true);
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: pwd }),
      });
      if (res.ok) {
        let data: { ok?: boolean; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          // 200이면 쿠키는 설정된 것으로 간주
        }
        if (data.ok !== false) {
          toast.success("Admin login successful!");
          setAdminPassword("");
          refresh();
        } else {
          toast.error(data.error || "Login failed");
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Login failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setAdminLoginPending(false);
    }
  };

  const handleSpawnMultipleBots = async () => {
    for (let i = 0; i < spawnCount; i++) {
      await spawnBotMutation.mutateAsync({
        nickname: `Bot-${Date.now()}-${i}`,
      });
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  const applyTheme = () => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--secondary-color', secondaryColor);
    root.style.setProperty('--accent-color', accentColor);
    
    // Save to localStorage
    localStorage.setItem('theme-primary', primaryColor);
    localStorage.setItem('theme-secondary', secondaryColor);
    localStorage.setItem('theme-accent', accentColor);
    localStorage.setItem('theme-font', fontFamily);
    localStorage.setItem('theme-glitch', enableGlitch.toString());
    localStorage.setItem('theme-scanline', enableScanline.toString());
    
    toast.success("Theme applied successfully!");
  };

  const resetTheme = () => {
    setPrimaryColor("#94f814");
    setSecondaryColor("#00ffff");
    setAccentColor("#ff00ff");
    setFontFamily("Orbitron");
    setEnableGlitch(true);
    setEnableScanline(true);
    
    localStorage.removeItem('theme-primary');
    localStorage.removeItem('theme-secondary');
    localStorage.removeItem('theme-accent');
    localStorage.removeItem('theme-font');
    localStorage.removeItem('theme-glitch');
    localStorage.removeItem('theme-scanline');
    
    const root = document.documentElement;
    root.style.removeProperty('--primary-color');
    root.style.removeProperty('--secondary-color');
    root.style.removeProperty('--accent-color');
    
    toast.success("Theme reset to default!");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center scan-line">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center scan-line">
        <Card className="cyber-card p-8 text-center max-w-md">
          <h1 className="text-2xl font-['Orbitron'] font-bold text-destructive mb-4">ACCESS DENIED</h1>
          <p className="text-muted-foreground mb-2">Admin access required</p>
          <p className="text-sm text-muted-foreground/80 mb-6">
            {user
              ? "Log out and log in again, or set OWNER_OPEN_ID in server .env to your OpenID and restart."
              : "관리자 비밀번호로 로그인하세요. 서버 .env에 ADMIN_PASSWORD를 설정해야 합니다."}
          </p>

          <div className="mb-6 text-left space-y-2">
            <Label className="text-sm font-['Rajdhani'] text-muted-foreground">관리자 비밀번호</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Admin password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                className="neon-box bg-black/50 border-primary/50 text-foreground flex-1"
                disabled={adminLoginPending}
              />
              <Button
                className="cyber-button"
                onClick={handleAdminLogin}
                disabled={!adminPassword.trim() || adminLoginPending}
              >
                {adminLoginPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "로그인"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/">
              <Button variant="outline" className="cyber-button">Go Home</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen scan-line">
      <div className="fixed inset-0 cyber-grid opacity-20 pointer-events-none" />
      
      {/* Header */}
      <header className="border-b border-primary/30 neon-box relative z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-['Orbitron'] font-bold neon-text glitch">ADMIN CONTROL PANEL</h1>
            <p className="text-sm text-muted-foreground font-['Rajdhani']">Game Testing & Management</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/arena">
              <Button className="cyber-button" style={{borderColor: '#00ffff', color: '#00ffff'}}>View Game Arena</Button>
            </Link>
            <Link href="/">
              <Button className="cyber-button" style={{borderColor: '#ff00ff', color: '#ff00ff'}}>Home</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="cyber-card p-6">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span className="text-2xl font-['Orbitron'] font-bold text-primary">{stats?.totalRounds ?? 0}</span>
            </div>
            <div className="text-sm text-muted-foreground font-['Rajdhani']">Total Rounds</div>
          </Card>

          <Card className="cyber-card p-6">
            <div className="flex items-center justify-between mb-2">
              <Bot className="w-5 h-5" style={{color: '#00ffff'}} />
              <span className="text-2xl font-['Orbitron'] font-bold" style={{color: '#00ffff'}}>{stats?.totalAgents ?? 0}</span>
            </div>
            <div className="text-sm text-muted-foreground font-['Rajdhani']">Total Agents</div>
          </Card>

          <Card className="cyber-card p-6">
            <div className="flex items-center justify-between mb-2">
              <Bot className="w-5 h-5" style={{color: '#ffff00'}} />
              <span className="text-2xl font-['Orbitron'] font-bold" style={{color: '#ffff00'}}>{stats?.connectedAgents ?? 0}</span>
            </div>
            <div className="text-sm text-muted-foreground font-['Rajdhani']">Connected Agents</div>
          </Card>

          <Card className="cyber-card p-6">
            <div className="flex items-center justify-between mb-2">
              <Bot className="w-5 h-5" style={{color: '#ff00ff'}} />
              <span className="text-2xl font-['Orbitron'] font-bold" style={{color: '#ff00ff'}}>{botStatus?.connectedBots ?? 0}</span>
            </div>
            <div className="text-sm text-muted-foreground font-['Rajdhani']">Virtual Bots</div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="bots" className="space-y-6">
          <TabsList className="neon-box">
            <TabsTrigger value="bots" className="font-['Orbitron']">
              <Bot className="w-4 h-4 mr-2" />
              Bot Control
            </TabsTrigger>
            <TabsTrigger value="agents" className="font-['Orbitron']">
              <Settings className="w-4 h-4 mr-2" />
              Agent Management
            </TabsTrigger>
            <TabsTrigger value="theme" className="font-['Orbitron']">
              <Palette className="w-4 h-4 mr-2" />
              Theme Settings
            </TabsTrigger>
          </TabsList>

          {/* Bot Control Tab */}
          <TabsContent value="bots" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="cyber-card p-6">
                <h2 className="text-xl font-['Orbitron'] font-bold mb-4 flex items-center gap-2 text-primary">
                  <Bot className="w-5 h-5" />
                  Virtual Bot Control
                </h2>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block font-['Rajdhani']">Spawn Single Bot</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Bot nickname"
                        value={botName}
                        onChange={(e) => setBotName(e.target.value)}
                        className="neon-box bg-black/50 border-primary/50 text-foreground"
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
                        className="cyber-button"
                      >
                        {spawnBotMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-primary/30 pt-4">
                    <Label className="text-sm text-muted-foreground mb-2 block font-['Rajdhani']">Spawn Multiple Bots</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={spawnCount}
                        onChange={(e) => setSpawnCount(parseInt(e.target.value) || 1)}
                        className="neon-box bg-black/50 border-primary/50 text-foreground"
                      />
                      <Button
                        onClick={handleSpawnMultipleBots}
                        disabled={spawnBotMutation.isPending}
                        className="cyber-button"
                      >
                        Spawn {spawnCount} Bots
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-primary/30 pt-4">
                    <h3 className="text-sm font-['Orbitron'] font-bold mb-2 text-primary">Connected Bots</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {botStatus?.connectedBots && botStatus.connectedBots > 0 ? (
                        <div className="p-2 neon-box rounded">
                          <span className="text-sm font-['Rajdhani']">{botStatus.connectedBots} bot(s) connected</span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground font-['Rajdhani']">No bots connected</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="cyber-card p-6">
                <h2 className="text-xl font-['Orbitron'] font-bold mb-4 flex items-center gap-2" style={{color: '#00ffff'}}>
                  <BarChart3 className="w-5 h-5" />
                  Game Control
                </h2>

                <div className="space-y-4">
                  <Button
                    onClick={() => {
                      refetchStats();
                      refetchAgents();
                      refetchBotStatus();
                    }}
                    className="w-full cyber-button"
                    style={{borderColor: '#00ffff', color: '#00ffff'}}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh All Data
                  </Button>

                  <Button
                    onClick={() => {
                      if (confirm("Are you sure you want to reset the game? This will delete all rounds, questions, and votes (but keep agents).")) {
                        resetGameMutation.mutate();
                      }
                    }}
                    disabled={resetGameMutation.isPending}
                    className="w-full cyber-button"
                    style={{borderColor: '#ff0066', color: '#ff0066'}}
                  >
                    {resetGameMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Reset Game Data
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Agent Management Tab */}
          <TabsContent value="agents">
            <Card className="cyber-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-['Orbitron'] font-bold flex items-center gap-2 text-primary">
                  <Bot className="w-5 h-5" />
                  All Agents ({agents?.length ?? 0})
                </h2>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!agents?.length || deleteAllAgentsMutation.isPending}
                  onClick={() => {
                    if (confirm("Delete ALL agents? This also removes related questions, rounds, and votes. This cannot be undone.")) {
                      deleteAllAgentsMutation.mutate();
                    }
                  }}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All Agents
                </Button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {agents && agents.length > 0 ? (
                  agents.map((agent: any) => (
                    <div key={agent.id} className="flex items-center justify-between p-3 neon-box rounded">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-['Orbitron'] font-bold text-primary">{agent.nickname}</span>
                          {agent.isConnected && (
                            <span className="text-xs px-2 py-1 rounded neon-box" style={{borderColor: '#00ff00', color: '#00ff00'}}>
                              ONLINE
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground font-['Rajdhani'] mt-1">
                          Score: {agent.score} | Level: {agent.level} | Wins: {agent.wins} | Losses: {agent.losses}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete agent "${agent.nickname}"?`)) {
                            deleteAgentMutation.mutate({ agentId: agent.id });
                          }
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8 font-['Rajdhani']">No agents registered yet</p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Theme Settings Tab */}
          <TabsContent value="theme">
            <Card className="cyber-card p-6">
              <h2 className="text-xl font-['Orbitron'] font-bold mb-6 flex items-center gap-2 text-primary">
                <Palette className="w-5 h-5" />
                Frontend Theme Settings
              </h2>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label className="text-sm font-['Rajdhani'] mb-2 block">Primary Color (Neon Green)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="neon-box bg-black/50 border-primary/50 text-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-['Rajdhani'] mb-2 block">Secondary Color (Cyan)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="neon-box bg-black/50 border-primary/50 text-foreground"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-['Rajdhani'] mb-2 block">Accent Color (Pink)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="neon-box bg-black/50 border-primary/50 text-foreground"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-primary/30 pt-6">
                  <h3 className="text-lg font-['Orbitron'] font-bold mb-4 text-primary">Preview</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded" style={{backgroundColor: primaryColor, color: '#000'}}>
                      <p className="font-['Orbitron'] font-bold">Primary Color</p>
                      <p className="text-sm font-['Rajdhani']">Main accent color</p>
                    </div>
                    <div className="p-4 rounded" style={{backgroundColor: secondaryColor, color: '#000'}}>
                      <p className="font-['Orbitron'] font-bold">Secondary Color</p>
                      <p className="text-sm font-['Rajdhani']">Secondary accent</p>
                    </div>
                    <div className="p-4 rounded" style={{backgroundColor: accentColor, color: '#fff'}}>
                      <p className="font-['Orbitron'] font-bold">Accent Color</p>
                      <p className="text-sm font-['Rajdhani']">Highlight color</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-primary/30 pt-6 flex gap-4">
                  <Button onClick={applyTheme} className="cyber-button flex-1">
                    Apply Theme
                  </Button>
                  <Button onClick={resetTheme} className="cyber-button" style={{borderColor: '#ff0066', color: '#ff0066'}}>
                    Reset to Default
                  </Button>
                </div>

                <div className="border-t border-primary/30 pt-6">
                  <p className="text-sm text-muted-foreground font-['Rajdhani']">
                    ℹ️ Theme settings are saved to your browser's local storage. Changes will persist across sessions.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
