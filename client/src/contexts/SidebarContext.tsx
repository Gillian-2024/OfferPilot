import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getJobs, getActiveJobId, setActiveJob as persistActiveJob } from '../store/local';
import type { JobContext } from '../store/local';

interface SidebarContextValue {
  // 求职岗位（多岗位上下文，P0-1）
  jobs: JobContext[];
  activeJobId: string | null;
  setActiveJob: (id: string) => void;
  refreshJobs: () => void;

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
}

const SidebarContext = createContext<SidebarContextValue>(null!);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [jobs, setJobs] = useState<JobContext[]>(() => getJobs());
  const [activeJobId, setActiveJobIdState] = useState<string | null>(() => getActiveJobId());

  const setActiveJob = useCallback((id: string) => {
    persistActiveJob(id);
    setActiveJobIdState(id);
  }, []);

  const refreshJobs = useCallback(() => {
    setJobs(getJobs());
    setActiveJobIdState(getActiveJobId());
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openInviteDialog = useCallback(() => setInviteDialogOpen(true), []);
  const closeInviteDialog = useCallback(() => setInviteDialogOpen(false), []);
  const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  return (
    <SidebarContext.Provider value={{
      jobs, activeJobId, setActiveJob, refreshJobs,
      settingsOpen, openSettings, closeSettings,
      inviteDialogOpen, openInviteDialog, closeInviteDialog,
      authModalOpen, openAuthModal, closeAuthModal,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
