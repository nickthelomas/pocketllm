import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Settings2, User, Zap, Database, Cog, Shield } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Settings as SettingsType } from "@shared/schema";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState({
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    repeatPenalty: 1.1,
    seed: null,
    stopSequences: "",
    contextWindow: 10,
    memoryDepth: "last7days",
    rawMessageCount: 10,
    summaryFrequency: 10,
    tokenBudget: 4000,
    baseApiUrl: "http://127.0.0.1:11434",
    bearerToken: "",
    openrouter_api_key: "",
    remote_ollama_url: "",
    cloud_models_password_enabled: false,
    cloud_models_password: "",
    userProfile: "",
    chunkSize: 512,
    chunkOverlap: 50,
    topKResults: 3,
    similarityThreshold: 0.7,
    // GPU Acceleration Settings
    gpu_enabled: false,
    gpu_layers: 0,
    gpu_main_gpu: 0,
    gpu_low_vram: false,
    gpu_threads: 4,
    gpu_batch_size: 512,
  });

  const [showDisablePasswordDialog, setShowDisablePasswordDialog] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const { toast } = useToast();

  const handlePasswordToggle = async (checked: boolean) => {
    // If enabling, just enable it
    if (checked) {
      setSettings(prev => ({ ...prev, cloud_models_password_enabled: checked }));
      return;
    }

    // If disabling, require password verification
    setShowDisablePasswordDialog(true);
  };

  const handleDisablePasswordProtection = async () => {
    setIsVerifying(true);
    setPasswordError("");

    try {
      const response = await fetch("/api/auth/verify-cloud-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: verifyPassword }),
      });

      const data = await response.json();

      if (data.verified) {
        setSettings(prev => ({ ...prev, cloud_models_password_enabled: false }));
        setShowDisablePasswordDialog(false);
        setVerifyPassword("");
        setPasswordError("");
        toast({
          title: "Password Protection Disabled",
          description: "Kid-safe mode has been turned off.",
        });
      } else {
        setPasswordError("Incorrect password");
        setVerifyPassword("");
      }
    } catch (error) {
      setPasswordError("Failed to verify password");
      setVerifyPassword("");
    } finally {
      setIsVerifying(false);
    }
  };

  const { data: storedSettings } = useQuery<SettingsType[]>({
    queryKey: ["/api/settings"],
    enabled: isOpen,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settingsToSave: typeof settings) => {
      // Save each setting individually
      const promises = Object.entries(settingsToSave).map(([key, value]) =>
        apiRequest("POST", "/api/settings", {
          userId: null,
          key,
          // Convert null to empty string for database compatibility
          value: value === null ? "" : value,
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Load stored settings when modal opens
  useEffect(() => {
    if (storedSettings && Array.isArray(storedSettings)) {
      const settingsObj = storedSettings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, any>);
      
      setSettings(prev => ({ ...prev, ...settingsObj }));
    }
  }, [storedSettings]);

  const resetToDefaults = () => {
    setSettings({
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      repeatPenalty: 1.1,
      seed: null,
      stopSequences: "",
      contextWindow: 10,
      memoryDepth: "last7days",
      rawMessageCount: 10,
      summaryFrequency: 10,
      tokenBudget: 4000,
      baseApiUrl: "http://127.0.0.1:11434",
      bearerToken: "",
      openrouter_api_key: "",
      remote_ollama_url: "",
      cloud_models_password_enabled: false,
      cloud_models_password: "",
      userProfile: "",
      chunkSize: 512,
      chunkOverlap: 50,
      topKResults: 3,
      similarityThreshold: 0.7,
      gpu_enabled: false,
      gpu_layers: 0,
      gpu_main_gpu: 0,
      gpu_low_vram: false,
      gpu_threads: 4,
      gpu_batch_size: 512,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0" data-testid="settings-modal">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto space-y-8 px-6 pb-6 flex-1">
          {/* LLM Parameters */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Response Style</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <Label>Response Creativity</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[settings.temperature]}
                      onValueChange={([value]) => setSettings(prev => ({ ...prev, temperature: value }))}
                      max={2}
                      min={0}
                      step={0.1}
                      className="flex-1"
                      data-testid="slider-temperature"
                    />
                    <span className="text-sm font-mono w-12 text-right">{settings.temperature}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Focused</span>
                    <span>Imaginative</span>
                  </div>
                </div>
              </div>
              
              <div>
                <Label>Word Choice Variety</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[settings.topP]}
                      onValueChange={([value]) => setSettings(prev => ({ ...prev, topP: value }))}
                      max={1}
                      min={0}
                      step={0.05}
                      className="flex-1"
                      data-testid="slider-top-p"
                    />
                    <span className="text-sm font-mono w-12 text-right">{settings.topP}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Predictable</span>
                    <span>Diverse</span>
                  </div>
                </div>
              </div>
              
              <div>
                <Label>Response Length (words)</Label>
                <Input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  className="mt-2"
                  data-testid="input-max-tokens"
                />
                <p className="text-xs text-muted-foreground mt-1">Maximum words in response</p>
              </div>
              
              <div>
                <Label>Repetition Prevention</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[settings.repeatPenalty]}
                      onValueChange={([value]) => setSettings(prev => ({ ...prev, repeatPenalty: value }))}
                      max={2}
                      min={0}
                      step={0.1}
                      className="flex-1"
                      data-testid="slider-repeat-penalty"
                    />
                    <span className="text-sm font-mono w-12 text-right">{settings.repeatPenalty}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Can Repeat</span>
                    <span>Avoid Repeating</span>
                  </div>
                </div>
              </div>
              
              <div>
                <Label>Randomness Seed (Optional)</Label>
                <Input
                  type="number"
                  placeholder="Random each time"
                  value={settings.seed || ""}
                  onChange={(e) => setSettings(prev => ({ ...prev, seed: e.target.value ? parseInt(e.target.value) as any : null }))}
                  className="mt-2"
                  data-testid="input-seed"
                />
                <p className="text-xs text-muted-foreground mt-1">Set for repeatable responses</p>
              </div>
              
              <div>
                <Label>Stop Words (Optional)</Label>
                <Input
                  placeholder="e.g., ###, END"
                  value={settings.stopSequences}
                  onChange={(e) => setSettings(prev => ({ ...prev, stopSequences: e.target.value }))}
                  className="mt-2"
                  data-testid="input-stop-sequences"
                />
                <p className="text-xs text-muted-foreground mt-1">Words that end the response</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Hierarchical Memory */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold">Conversation Memory</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              <p className="text-sm text-muted-foreground">
                Controls how the AI remembers your conversation. Recent messages are kept in full, older messages are summarized to save memory.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <Label>Recent Messages to Keep</Label>
                <Input
                  type="number"
                  value={settings.rawMessageCount}
                  onChange={(e) => setSettings(prev => ({ ...prev, rawMessageCount: parseInt(e.target.value) }))}
                  min={1}
                  max={50}
                  className="mt-2"
                  data-testid="input-raw-message-count"
                />
                <p className="text-xs text-muted-foreground mt-1">Number of recent messages kept word-for-word</p>
              </div>
              
              <div>
                <Label>Auto-Summarize After</Label>
                <Input
                  type="number"
                  value={settings.summaryFrequency}
                  onChange={(e) => setSettings(prev => ({ ...prev, summaryFrequency: parseInt(e.target.value) }))}
                  min={5}
                  max={50}
                  step={5}
                  className="mt-2"
                  data-testid="input-summary-frequency"
                />
                <p className="text-xs text-muted-foreground mt-1">Creates summary after this many messages</p>
              </div>
              
              <div>
                <Label>Memory Size</Label>
                <Input
                  type="number"
                  value={settings.tokenBudget}
                  onChange={(e) => setSettings(prev => ({ ...prev, tokenBudget: parseInt(e.target.value) }))}
                  min={1000}
                  max={32000}
                  step={1000}
                  className="mt-2"
                  data-testid="input-token-budget"
                />
                <p className="text-xs text-muted-foreground mt-1">Total memory available for conversation (higher = more context)</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* API Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Cog className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">API Configuration</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>Base API URL (Local Ollama)</Label>
                <Input
                  type="url"
                  value={settings.baseApiUrl}
                  onChange={(e) => setSettings(prev => ({ ...prev, baseApiUrl: e.target.value }))}
                  className="mt-2 font-mono"
                  data-testid="input-base-api-url"
                />
                <p className="text-xs text-muted-foreground mt-1">URL for local Ollama server (e.g., http://127.0.0.1:11434)</p>
              </div>
              
              <div>
                <Label>Bearer Token (Optional)</Label>
                <Input
                  type="password"
                  placeholder="Enter token if required"
                  value={settings.bearerToken}
                  onChange={(e) => setSettings(prev => ({ ...prev, bearerToken: e.target.value }))}
                  className="mt-2 font-mono"
                  data-testid="input-bearer-token"
                />
              </div>

              <Separator className="my-6" />

              <div>
                <Label>OpenRouter API Key</Label>
                <Input
                  type="password"
                  placeholder="Enter OpenRouter API key for cloud models"
                  value={settings.openrouter_api_key}
                  onChange={(e) => setSettings(prev => ({ ...prev, openrouter_api_key: e.target.value }))}
                  className="mt-2 font-mono"
                  data-testid="input-openrouter-api-key"
                />
                <p className="text-xs text-muted-foreground mt-1">Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">openrouter.ai/keys</a></p>
              </div>

              <div>
                <Label>Remote Ollama URL</Label>
                <Input
                  type="url"
                  placeholder="Enter Tailscale URL (e.g., http://100.x.x.x:11434)"
                  value={settings.remote_ollama_url}
                  onChange={(e) => setSettings(prev => ({ ...prev, remote_ollama_url: e.target.value }))}
                  className="mt-2 font-mono"
                  data-testid="input-remote-ollama-url"
                />
                <p className="text-xs text-muted-foreground mt-1">URL for remote Ollama server via Tailscale or VPN</p>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <div>
                      <Label htmlFor="cloud-password-enabled">Kid-Safe Password Protection</Label>
                      <p className="text-xs text-muted-foreground">Require password before using paid cloud models</p>
                    </div>
                  </div>
                  <Switch
                    id="cloud-password-enabled"
                    checked={settings.cloud_models_password_enabled === true || settings.cloud_models_password_enabled === "true"}
                    onCheckedChange={handlePasswordToggle}
                    data-testid="switch-cloud-password"
                  />
                </div>

                {(settings.cloud_models_password_enabled === true || settings.cloud_models_password_enabled === "true") && (
                  <div>
                    <Label htmlFor="cloud-password">Cloud Models Password</Label>
                    <Input
                      id="cloud-password"
                      type="password"
                      placeholder="Enter password"
                      value={settings.cloud_models_password}
                      onChange={(e) => setSettings(prev => ({ ...prev, cloud_models_password: e.target.value }))}
                      className="mt-2"
                      data-testid="input-cloud-password"
                    />
                    <p className="text-xs text-muted-foreground mt-1">This password will be required when selecting paid cloud models (OpenRouter)</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <Separator />

          {/* GPU Acceleration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-yellow-500" />
              <h3 className="text-lg font-semibold">GPU Acceleration</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              <p className="text-sm text-muted-foreground">
                Optimize Ollama for GPU acceleration on mobile and desktop devices. Requires Ollama restart after changes.
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="gpu-enabled">Enable GPU Acceleration</Label>
                  <p className="text-xs text-muted-foreground mt-1">Use GPU for faster inference (requires compatible GPU)</p>
                </div>
                <Button
                  id="gpu-enabled"
                  variant={settings.gpu_enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSettings(prev => ({ ...prev, gpu_enabled: !prev.gpu_enabled }))}
                  data-testid="button-gpu-enabled"
                >
                  {settings.gpu_enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              {settings.gpu_enabled && (
                <>
                  <div>
                    <Label>GPU Layers (0-32)</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <Slider
                        value={[settings.gpu_layers]}
                        onValueChange={([value]) => setSettings(prev => ({ ...prev, gpu_layers: value }))}
                        min={0}
                        max={32}
                        step={1}
                        className="flex-1"
                        data-testid="slider-gpu-layers"
                      />
                      <Badge variant="secondary" className="min-w-[50px] justify-center">
                        {settings.gpu_layers}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Number of model layers to offload to GPU (higher = faster but more VRAM)
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Main GPU Device</Label>
                      <Input
                        type="number"
                        value={settings.gpu_main_gpu}
                        onChange={(e) => setSettings(prev => ({ ...prev, gpu_main_gpu: parseInt(e.target.value) }))}
                        min={0}
                        max={3}
                        className="mt-2"
                        data-testid="input-main-gpu"
                      />
                      <p className="text-xs text-muted-foreground mt-1">GPU device ID (usually 0)</p>
                    </div>

                    <div>
                      <Label>CPU Threads</Label>
                      <Input
                        type="number"
                        value={settings.gpu_threads}
                        onChange={(e) => setSettings(prev => ({ ...prev, gpu_threads: parseInt(e.target.value) }))}
                        min={1}
                        max={16}
                        className="mt-2"
                        data-testid="input-gpu-threads"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Number of CPU threads (4-8 optimal)</p>
                    </div>

                    <div>
                      <Label>Batch Size</Label>
                      <Input
                        type="number"
                        value={settings.gpu_batch_size}
                        onChange={(e) => setSettings(prev => ({ ...prev, gpu_batch_size: parseInt(e.target.value) }))}
                        min={32}
                        max={2048}
                        step={32}
                        className="mt-2"
                        data-testid="input-batch-size"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Processing batch size (512 optimal)</p>
                    </div>

                    <div>
                      <Label htmlFor="low-vram">Low VRAM Mode</Label>
                      <div className="mt-2">
                        <Button
                          id="low-vram"
                          variant={settings.gpu_low_vram ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSettings(prev => ({ ...prev, gpu_low_vram: !prev.gpu_low_vram }))}
                          className="w-full"
                          data-testid="button-low-vram"
                        >
                          {settings.gpu_low_vram ? "Enabled" : "Disabled"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Reduce VRAM usage for mobile GPUs</p>
                    </div>
                  </div>

                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-xs text-yellow-500">
                      ⚡ For Samsung S24+: Use 16-24 GPU layers with Snapdragon (OpenCL) or 8-16 with Exynos (Vulkan)
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>

          <Separator />

          {/* User Profile */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold">User Profile & Rules</h3>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This profile is automatically included in every system prompt to personalize responses.
              </p>
              <Textarea
                rows={8}
                className="font-mono resize-none"
                placeholder="Example: I'm Nick, a software engineer specializing in AI/ML. I prefer concise, technical explanations with code examples when relevant..."
                value={settings.userProfile}
                onChange={(e) => setSettings(prev => ({ ...prev, userProfile: e.target.value }))}
                data-testid="textarea-user-profile"
              />
              
              <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/30 rounded-lg">
                <svg className="w-5 h-5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-accent">Profile is active and will be included in all conversations</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* RAG Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Document Search</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              <p className="text-sm text-muted-foreground">
                Controls how uploaded documents are searched and used to answer your questions.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <Label>Document Piece Size</Label>
                <Input
                  type="number"
                  value={settings.chunkSize}
                  onChange={(e) => setSettings(prev => ({ ...prev, chunkSize: parseInt(e.target.value) }))}
                  min={128}
                  max={2048}
                  step={128}
                  className="mt-2"
                  data-testid="input-chunk-size"
                />
                <p className="text-xs text-muted-foreground mt-1">How documents are split for searching (lower = more precise)</p>
              </div>
              
              <div>
                <Label>Context Overlap</Label>
                <Input
                  type="number"
                  value={settings.chunkOverlap}
                  onChange={(e) => setSettings(prev => ({ ...prev, chunkOverlap: parseInt(e.target.value) }))}
                  min={0}
                  max={256}
                  step={10}
                  className="mt-2"
                  data-testid="input-chunk-overlap"
                />
                <p className="text-xs text-muted-foreground mt-1">How much pieces overlap (prevents missing context)</p>
              </div>
              
              <div>
                <Label>Documents to Retrieve</Label>
                <Input
                  type="number"
                  value={settings.topKResults}
                  onChange={(e) => setSettings(prev => ({ ...prev, topKResults: parseInt(e.target.value) }))}
                  min={1}
                  max={10}
                  className="mt-2"
                  data-testid="input-top-k-results"
                />
                <p className="text-xs text-muted-foreground mt-1">How many document pieces to use per answer</p>
              </div>
              
              <div>
                <Label>Match Accuracy</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[settings.similarityThreshold]}
                      onValueChange={([value]) => setSettings(prev => ({ ...prev, similarityThreshold: value }))}
                      max={1}
                      min={0}
                      step={0.05}
                      className="flex-1"
                      data-testid="slider-similarity-threshold"
                    />
                    <span className="text-sm font-mono w-12 text-right">{settings.similarityThreshold}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Related Content</span>
                    <span>Exact Match</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">How closely documents must match your question</p>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-background">
          <Button variant="outline" onClick={resetToDefaults} data-testid="button-reset-settings">
            Reset to Defaults
          </Button>
          <Button
            onClick={() => saveSettingsMutation.mutate(settings)}
            disabled={saveSettingsMutation.isPending}
            data-testid="button-save-settings"
          >
            Save Settings
          </Button>
        </div>
      </DialogContent>

      {/* Password Verification Dialog for Disabling */}
      <Dialog open={showDisablePasswordDialog} onOpenChange={(open) => {
        if (!open) {
          // User cancelled - don't change the setting
          setShowDisablePasswordDialog(false);
          setVerifyPassword("");
          setPasswordError("");
        }
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-disable-password">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              <DialogTitle>Verify Password</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Enter your password to disable kid-safe mode.
            </p>

            <div className="space-y-2">
              <Label htmlFor="verify-password">Password</Label>
              <Input
                id="verify-password"
                type="password"
                value={verifyPassword}
                onChange={(e) => {
                  setVerifyPassword(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleDisablePasswordProtection()}
                placeholder="Enter password"
                autoFocus
                data-testid="input-verify-password"
              />
              {passwordError && (
                <p className="text-sm text-destructive" data-testid="text-password-error">
                  {passwordError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisablePasswordDialog(false);
                  setVerifyPassword("");
                  setPasswordError("");
                }}
                data-testid="button-cancel-disable"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDisablePasswordProtection}
                disabled={isVerifying || !verifyPassword}
                data-testid="button-confirm-disable"
              >
                {isVerifying ? "Verifying..." : "Disable Protection"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
