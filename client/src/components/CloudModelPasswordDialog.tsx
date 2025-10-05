import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2 } from "lucide-react";

interface CloudModelPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  modelName: string;
}

export default function CloudModelPasswordDialog({
  isOpen,
  onClose,
  onSuccess,
  modelName
}: CloudModelPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async () => {
    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-cloud-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.verified) {
        setPassword("");
        setError("");
        onSuccess();
        onClose();
      } else {
        setError("Incorrect password");
        setPassword("");
      }
    } catch (error) {
      setError("Failed to verify password");
      setPassword("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent data-testid="dialog-cloud-password">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <DialogTitle>Password Required</DialogTitle>
          </div>
          <DialogDescription>
            This is a paid cloud model. Enter the password to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="model-name">Model</Label>
            <Input
              id="model-name"
              value={modelName}
              disabled
              className="font-mono text-sm"
              data-testid="input-model-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Enter password"
              autoFocus
              data-testid="input-password"
            />
            {error && (
              <p className="text-sm text-destructive" data-testid="text-error">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isVerifying} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isVerifying} data-testid="button-submit">
            {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
