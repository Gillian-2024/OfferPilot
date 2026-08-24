import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ExpandedSection = 'project-history' | null;
type HistoryTab = 'tree' | 'history';

interface SidebarContextValue {
  // Collapse state
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;

  // Expanded section (currently only 'project-history')
  expandedSection: ExpandedSection;
  setExpandedSection: (section: ExpandedSection) => void;

  // History tab switching
  historyTab: HistoryTab;
  setHistoryTab: (tab: HistoryTab) => void;

  // Callbacks
  openSettings: () => void;
  closeSettings: () => void;
  settingsOpen: boolean;

  openInviteDialog: () => void;
  closeInviteDialog: () => void;
  inviteDialogOpen: boolean;

  openAuthModal: () => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;

  openNewProject: () => void;
  closeNewProject: () => void;
  newProjectModalOpen: boolean;
}

const SidebarContext = createContext<SidebarContextValue>(null!);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('tree');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openInviteDialog = useCallback(() => setInviteDialogOpen(true), []);
  const closeInviteDialog = useCallback(() => setInviteDialogOpen(false), []);
  const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);
  const openNewProject = useCallback(() => setNewProjectModalOpen(true), []);
  const closeNewProject = useCallback(() => setNewProjectModalOpen(false), []);

  return (
    <SidebarContext.Provider value={{
      collapsed, setCollapsed,
      expandedSection, setExpandedSection,
      historyTab, setHistoryTab,
      settingsOpen, openSettings, closeSettings,
      inviteDialogOpen, openInviteDialog, closeInviteDialog,
      authModalOpen, openAuthModal, closeAuthModal,
      newProjectModalOpen, openNewProject, closeNewProject,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
