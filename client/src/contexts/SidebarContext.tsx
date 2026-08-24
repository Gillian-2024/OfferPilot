import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ExpandedSection = 'project-history' | null;
type HistoryTab = 'tree' | 'history';

interface SidebarContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  expandedSection: ExpandedSection;
  setExpandedSection: (section: ExpandedSection) => void;
  historyTab: HistoryTab;
  setHistoryTab: (tab: HistoryTab) => void;
  toggleSidebar: () => void;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('tree');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
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
      sidebarOpen, setSidebarOpen,
      expandedSection, setExpandedSection,
      historyTab, setHistoryTab,
      toggleSidebar,
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
