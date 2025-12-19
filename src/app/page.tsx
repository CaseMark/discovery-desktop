'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, FolderOpen, Search, FileText, Lock, Trash2, Loader2, Settings, LayoutGrid, List, Pencil, Check, X, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';

interface Case {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  documentCount: number;
  createdAt: string;
}

interface BrandingSettings {
  firmName: string | null;
  logoData: string | null;
  logoMimeType: string | null;
}

type ViewMode = 'card' | 'list';

export default function HomePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', password: '' });
  const [accessPassword, setAccessPassword] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  
  // New state for drive-like features
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editPasswordDialogOpen, setEditPasswordDialogOpen] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // PARALLEL: Fetch cases and branding concurrently
    Promise.all([fetchCases(), fetchBranding()]);
  }, []);

  useEffect(() => {
    // Focus the edit input when editing starts
    if (editingCaseId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCaseId]);

  const fetchCases = async () => {
    try {
      const response = await fetch('/api/cases');
      if (response.ok) {
        const data = await response.json();
        setCases(data.cases);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranding = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setBranding(data.settings);
      }
    } catch (err) {
      console.error('Failed to fetch branding:', err);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setCreateDialogOpen(false);
        setFormData({ name: '', description: '', password: '' });
        // Store the session and redirect
        sessionStorage.setItem(`case_${data.case.id}`, 'authenticated');
        window.location.href = `/cases/${data.case.id}`;
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create case');
      }
    } catch (err) {
      setError('Failed to create case');
    } finally {
      setCreating(false);
    }
  };

  const handleAccessCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    setError('');

    try {
      const response = await fetch(`/api/cases/${selectedCase.id}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accessPassword }),
      });

      if (response.ok) {
        sessionStorage.setItem(`case_${selectedCase.id}`, 'authenticated');
        window.location.href = `/cases/${selectedCase.id}`;
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Failed to verify password');
    }
  };

  const openAccessDialog = (caseItem: Case) => {
    // Check if already authenticated
    if (sessionStorage.getItem(`case_${caseItem.id}`) === 'authenticated') {
      window.location.href = `/cases/${caseItem.id}`;
      return;
    }
    setSelectedCase(caseItem);
    setAccessPassword('');
    setError('');
    setAccessDialogOpen(true);
  };

  const openDeleteDialog = (caseItem: Case, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setCaseToDelete(caseItem);
    setDeletePassword('');
    setDeleteError('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseToDelete) return;
    
    setDeleteError('');
    setDeletingCaseId(caseToDelete.id);
    
    try {
      const response = await fetch(`/api/cases/${caseToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });

      if (response.ok) {
        // Remove from local state
        setCases(prev => prev.filter(c => c.id !== caseToDelete.id));
        // Clear session storage for this case
        sessionStorage.removeItem(`case_${caseToDelete.id}`);
        // Close dialog
        setDeleteDialogOpen(false);
        setCaseToDelete(null);
        setDeletePassword('');
      } else {
        const error = await response.json();
        setDeleteError(error.error || 'Failed to delete case');
      }
    } catch (err) {
      console.error('Failed to delete case:', err);
      setDeleteError('Failed to delete case. Please try again.');
    } finally {
      setDeletingCaseId(null);
    }
  };

  // Start editing a case name
  const startEditing = (caseItem: Case, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCaseId(caseItem.id);
    setEditingName(caseItem.name);
    setEditError('');
  };

  // Cancel editing
  const cancelEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingCaseId(null);
    setEditingName('');
    setEditError('');
  };

  // Open password dialog for saving edit
  const openEditPasswordDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingName.trim()) {
      setEditError('Name cannot be empty');
      return;
    }
    setEditPassword('');
    setEditError('');
    setEditPasswordDialogOpen(true);
  };

  // Save the edited name
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCaseId || !editingName.trim()) return;

    setSavingEdit(true);
    setEditError('');

    try {
      const response = await fetch(`/api/cases/${editingCaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editingName.trim(),
          currentPassword: editPassword 
        }),
      });

      if (response.ok) {
        // Update local state
        setCases(prev => prev.map(c => 
          c.id === editingCaseId ? { ...c, name: editingName.trim() } : c
        ));
        setEditingCaseId(null);
        setEditingName('');
        setEditPasswordDialogOpen(false);
        setEditPassword('');
      } else {
        const data = await response.json();
        setEditError(data.error || 'Failed to update name');
      }
    } catch (err) {
      setEditError('Failed to update name');
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter cases based on search query
  const filteredCases = cases.filter(caseItem => {
    const query = searchQuery.toLowerCase();
    return (
      caseItem.name.toLowerCase().includes(query) ||
      (caseItem.description?.toLowerCase().includes(query) ?? false)
    );
  });

  // Render a case card
  const renderCaseCard = (caseItem: Case) => (
    <Card
      key={caseItem.id}
      className="cursor-pointer hover:shadow-md transition-shadow group relative"
      onClick={() => !editingCaseId && openAccessDialog(caseItem)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {editingCaseId === caseItem.id ? (
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <Input
                  ref={editInputRef}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="h-8 text-lg font-semibold"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelEditing();
                    if (e.key === 'Enter') openEditPasswordDialog(e as unknown as React.MouseEvent);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={openEditPasswordDialog}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={cancelEditing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{caseItem.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0"
                  onClick={(e) => startEditing(caseItem, e)}
                  title="Edit name"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </CardTitle>
            )}
            {caseItem.description && !editingCaseId && (
              <CardDescription className="mt-1 line-clamp-2">
                {caseItem.description}
              </CardDescription>
            )}
          </div>
          {editingCaseId !== caseItem.id && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={(e) => openDeleteDialog(caseItem, e)}
              disabled={deletingCaseId === caseItem.id}
              title="Delete case"
            >
              {deletingCaseId === caseItem.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* AI-generated tags */}
        {caseItem.tags && caseItem.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {caseItem.tags.slice(0, 4).map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
              >
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
            {caseItem.tags.length > 4 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-muted-foreground">
                +{caseItem.tags.length - 4} more
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {caseItem.documentCount} documents
          </div>
          <div>Created {formatDate(caseItem.createdAt)}</div>
        </div>
      </CardContent>
    </Card>
  );

  // Render a case list item
  const renderCaseListItem = (caseItem: Case) => (
    <div
      key={caseItem.id}
      className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors group"
      onClick={() => !editingCaseId && openAccessDialog(caseItem)}
    >
      <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        {editingCaseId === caseItem.id ? (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Input
              ref={editInputRef}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="h-8 max-w-md"
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEditing();
                if (e.key === 'Enter') openEditPasswordDialog(e as unknown as React.MouseEvent);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={openEditPasswordDialog}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={cancelEditing}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{caseItem.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={(e) => startEditing(caseItem, e)}
              title="Edit name"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
        {caseItem.description && !editingCaseId && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {caseItem.description}
          </p>
        )}
        {/* AI-generated tags in list view */}
        {caseItem.tags && caseItem.tags.length > 0 && !editingCaseId && (
          <div className="flex flex-wrap gap-1 mt-1">
            {caseItem.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
            {caseItem.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{caseItem.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-6 text-sm text-muted-foreground flex-shrink-0">
        <div className="flex items-center gap-1 w-28">
          <FileText className="h-4 w-4" />
          {caseItem.documentCount} docs
        </div>
        <div className="w-32">{formatDate(caseItem.createdAt)}</div>
        {editingCaseId !== caseItem.id && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={(e) => openDeleteDialog(caseItem, e)}
            disabled={deletingCaseId === caseItem.id}
            title="Delete case"
          >
            {deletingCaseId === caseItem.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          {/* Left section: Firm branding OR Discovery Dashboard title (when no firm name) */}
          <div className="flex items-center gap-3 flex-1">
            {branding?.firmName ? (
              // Has firm name: show logo + firm name on left
              <>
                {branding?.logoData && branding?.logoMimeType && (
                  <img
                    src={`data:${branding.logoMimeType};base64,${branding.logoData}`}
                    alt="Firm logo"
                    className="h-8 w-8 object-contain"
                  />
                )}
                <span className="text-lg font-medium">{branding.firmName}</span>
              </>
            ) : (
              // No firm name: show Discovery Dashboard on left with optional logo
              <>
                {branding?.logoData && branding?.logoMimeType ? (
                  <img
                    src={`data:${branding.logoMimeType};base64,${branding.logoData}`}
                    alt="Logo"
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  <FolderOpen className="h-6 w-6 text-primary" />
                )}
                <h1 className="text-xl font-semibold">Discovery Dashboard</h1>
              </>
            )}
          </div>
          
          {/* Center: Discovery Dashboard title (only when firm name exists) */}
          {branding?.firmName && (
            <h1 className="text-xl font-semibold text-center flex-1">
              Discovery Dashboard
            </h1>
          )}
          
          {/* Right: Action buttons */}
          <div className={`flex items-center gap-2 ${branding?.firmName ? 'flex-1' : ''} justify-end`}>
            <Link href="/settings">
              <Button variant="ghost" size="icon" title="Settings">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Discovery
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateCase}>
                <DialogHeader>
                  <DialogTitle>Create New Discovery</DialogTitle>
                  <DialogDescription>
                    Create a new discovery vault to store and search documents.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Discovery Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Smith v. Jones 2024"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      placeholder="Brief description of the discovery"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Vault Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Password to protect this vault"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 6 characters. You&apos;ll need this to access the discovery.
                    </p>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Creating...' : 'Create Discovery'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search and View Toggle Bar */}
        {cases.length > 0 && (
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search discoveries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setViewMode('card')}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading discoveries...</div>
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No discoveries yet</h2>
            <p className="text-muted-foreground mb-4">
              Create your first discovery to start uploading and searching documents.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Discovery
            </Button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No results found</h2>
            <p className="text-muted-foreground">
              No discoveries match &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCases.map(renderCaseCard)}
          </div>
        ) : (
          <div className="space-y-2">
            {/* List header */}
            <div className="flex items-center gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
              <div className="w-5" /> {/* Lock icon spacer */}
              <div className="flex-1">Name</div>
              <div className="w-28">Documents</div>
              <div className="w-32">Created</div>
              <div className="w-8" /> {/* Delete button spacer */}
            </div>
            {filteredCases.map(renderCaseListItem)}
          </div>
        )}
      </main>

      {/* Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAccessCase}>
            <DialogHeader>
              <DialogTitle>Enter Password</DialogTitle>
              <DialogDescription>
                Enter the password to access &quot;{selectedCase?.name}&quot;
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="access-password">Password</Label>
                <Input
                  id="access-password"
                  type="password"
                  placeholder="Enter vault password"
                  value={accessPassword}
                  onChange={(e) => setAccessPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccessDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Access Discovery
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <form onSubmit={handleDeleteCase}>
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Discovery</DialogTitle>
              <DialogDescription>
                This will permanently delete &quot;{caseToDelete?.name}&quot; and all {caseToDelete?.documentCount} document(s). This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="delete-password">Enter discovery password to confirm</Label>
                <Input
                  id="delete-password"
                  type="password"
                  placeholder="Enter vault password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </div>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={deletingCaseId !== null}>
                {deletingCaseId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Discovery'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Name Password Dialog */}
      <Dialog open={editPasswordDialogOpen} onOpenChange={setEditPasswordDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle>Confirm Password</DialogTitle>
              <DialogDescription>
                Enter the discovery password to save the new name.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-password">Password</Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="Enter vault password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  required
                />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setEditPasswordDialogOpen(false);
                cancelEditing();
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Name'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
