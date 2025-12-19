'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings, Palette, Shield, Upload, X, Loader2, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AppSettings {
  id: string;
  firmName: string | null;
  logoData: string | null;
  logoMimeType: string | null;
}

interface Case {
  id: string;
  name: string;
  description: string | null;
  hasPassword: boolean;
}

export default function SettingsPage() {
  // Branding state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [firmName, setFirmName] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoMimeType, setLogoMimeType] = useState<string | null>(null);
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Privacy state
  const [cases, setCases] = useState<Case[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load settings on mount
  useEffect(() => {
    fetchSettings();
    fetchCases();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
        setFirmName(data.settings.firmName || '');
        if (data.settings.logoData && data.settings.logoMimeType) {
          setLogoPreview(`data:${data.settings.logoMimeType};base64,${data.settings.logoData}`);
          setLogoData(data.settings.logoData);
          setLogoMimeType(data.settings.logoMimeType);
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const fetchCases = async () => {
    try {
      const response = await fetch('/api/cases');
      if (response.ok) {
        const data = await response.json();
        // Map cases to include hasPassword info
        setCases(data.cases.map((c: { id: string; name: string; description: string | null }) => ({
          ...c,
          hasPassword: true, // All cases have passwords by default
        })));
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setBrandingMessage({ type: 'error', text: 'Please upload an image file' });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setBrandingMessage({ type: 'error', text: 'Image must be less than 2MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoPreview(result);
      // Extract base64 data (remove data:image/xxx;base64, prefix)
      const base64Data = result.split(',')[1];
      setLogoData(base64Data);
      setLogoMimeType(file.type);
      setBrandingMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoData(null);
    setLogoMimeType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    setBrandingMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmName: firmName || null,
          logoData: logoData,
          logoMimeType: logoMimeType,
        }),
      });

      if (response.ok) {
        setBrandingMessage({ type: 'success', text: 'Branding settings saved successfully!' });
        // Refresh the page to update header
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const error = await response.json();
        setBrandingMessage({ type: 'error', text: error.error || 'Failed to save settings' });
      }
    } catch (err) {
      setBrandingMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSavingBranding(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId) return;

    setPasswordMessage(null);

    // Validate
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is required' });
      return;
    }

    if (!removePassword) {
      if (!newPassword) {
        setPasswordMessage({ type: 'error', text: 'New password is required' });
        return;
      }
      if (newPassword.length < 6) {
        setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
        return;
      }
    }

    setSavingPassword(true);

    try {
      const response = await fetch(`/api/cases/${selectedCaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword: removePassword ? undefined : newPassword,
          removePassword: removePassword || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPasswordMessage({ type: 'success', text: data.message });
        // Reset form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setRemovePassword(false);
        // Update case in list
        if (removePassword) {
          setCases(prev => prev.map(c => 
            c.id === selectedCaseId ? { ...c, hasPassword: false } : c
          ));
        }
      } else {
        const error = await response.json();
        setPasswordMessage({ type: 'error', text: error.error || 'Failed to update password' });
      }
    } catch (err) {
      setPasswordMessage({ type: 'error', text: 'Failed to update password' });
    } finally {
      setSavingPassword(false);
    }
  };

  const selectedCase = cases.find(c => c.id === selectedCaseId);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Tabs defaultValue="branding" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Privacy
            </TabsTrigger>
          </TabsList>

          {/* Branding Tab */}
          <TabsContent value="branding" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Firm Branding</CardTitle>
                <CardDescription>
                  Customize the application with your firm&apos;s logo and name.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo Upload */}
                <div className="space-y-3">
                  <Label>Firm Logo</Label>
                  <div className="flex items-start gap-4">
                    {logoPreview ? (
                      <div className="relative">
                        <div className="w-24 h-24 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={handleRemoveLogo}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Recommended: Square image, PNG or SVG, max 2MB.
                        <br />
                        This will appear in the header.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Firm Name */}
                <div className="space-y-2">
                  <Label htmlFor="firmName">Firm Name</Label>
                  <Input
                    id="firmName"
                    placeholder="e.g., Smith & Associates LLP"
                    value={firmName}
                    onChange={(e) => setFirmName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be displayed alongside the logo in the header.
                  </p>
                </div>

                {/* Save Button */}
                {brandingMessage && (
                  <div
                    className={`p-3 rounded-md text-sm ${
                      brandingMessage.type === 'success'
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    }`}
                  >
                    {brandingMessage.text}
                  </div>
                )}
                <Button onClick={handleSaveBranding} disabled={savingBranding}>
                  {savingBranding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Branding'
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Case Passwords</CardTitle>
                <CardDescription>
                  Manage passwords for your cases. You can change or remove passwords.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingCases ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : cases.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No cases found. Create a case first to manage its password.
                  </div>
                ) : (
                  <>
                    {/* Case Selection */}
                    <div className="space-y-2">
                      <Label>Select Case</Label>
                      <div className="grid gap-2">
                        {cases.map((caseItem) => (
                          <div
                            key={caseItem.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedCaseId === caseItem.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/50'
                            }`}
                            onClick={() => {
                              setSelectedCaseId(caseItem.id);
                              setPasswordMessage(null);
                              setCurrentPassword('');
                              setNewPassword('');
                              setConfirmPassword('');
                              setRemovePassword(false);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {caseItem.hasPassword ? (
                                  <Lock className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Unlock className="h-4 w-4 text-green-600" />
                                )}
                                <span className="font-medium">{caseItem.name}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {caseItem.hasPassword ? 'Password protected' : 'No password'}
                              </span>
                            </div>
                            {caseItem.description && (
                              <p className="text-sm text-muted-foreground mt-1 ml-6">
                                {caseItem.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Password Form */}
                    {selectedCase && selectedCase.hasPassword && (
                      <form onSubmit={handlePasswordChange} className="space-y-4 pt-4 border-t">
                        <h4 className="font-medium">
                          Update Password for &quot;{selectedCase.name}&quot;
                        </h4>

                        <div className="space-y-2">
                          <Label htmlFor="currentPassword">Current Password</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            placeholder="Enter current password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="removePassword"
                            checked={removePassword}
                            onChange={(e) => setRemovePassword(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor="removePassword" className="text-sm font-normal cursor-pointer">
                            Remove password (make case accessible without authentication)
                          </Label>
                        </div>

                        {!removePassword && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="newPassword">New Password</Label>
                              <Input
                                id="newPassword"
                                type="password"
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={6}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="confirmPassword">Confirm New Password</Label>
                              <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                              />
                            </div>
                          </>
                        )}

                        {passwordMessage && (
                          <div
                            className={`p-3 rounded-md text-sm ${
                              passwordMessage.type === 'success'
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                            }`}
                          >
                            {passwordMessage.text}
                          </div>
                        )}

                        <Button type="submit" disabled={savingPassword}>
                          {savingPassword ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : removePassword ? (
                            'Remove Password'
                          ) : (
                            'Update Password'
                          )}
                        </Button>
                      </form>
                    )}

                    {selectedCase && !selectedCase.hasPassword && (
                      <div className="pt-4 border-t">
                        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                          <div className="flex items-center gap-2">
                            <Unlock className="h-5 w-5" />
                            <span className="font-medium">No Password Required</span>
                          </div>
                          <p className="text-sm mt-1">
                            This case is accessible without a password. To add password protection,
                            you&apos;ll need to delete and recreate the case.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
