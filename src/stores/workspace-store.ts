"use client";

import { create } from "zustand";

import type { AiRole, AssistMode, AssistSuggestion, StoryForgeTab } from "@/types/storyforge";

type SaveState = "idle" | "saving" | "saved" | "error";

interface WorkspaceStore {
  activeTab: StoryForgeTab;
  selectedChapterId: string | null;
  assistMode: AssistMode;
  activeAiRole: AiRole;
  saveState: SaveState;
  pendingSuggestion: AssistSuggestion | null;
  setActiveTab: (tab: StoryForgeTab) => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setAssistMode: (mode: AssistMode) => void;
  setActiveAiRole: (role: AiRole) => void;
  setSaveState: (state: SaveState) => void;
  setPendingSuggestion: (suggestion: AssistSuggestion | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeTab: "chapters",
  selectedChapterId: null,
  assistMode: "CO_WRITE",
  activeAiRole: "COWRITER",
  saveState: "idle",
  pendingSuggestion: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setAssistMode: (assistMode) => set({ assistMode }),
  setActiveAiRole: (activeAiRole) => set({ activeAiRole }),
  setSaveState: (saveState) => set({ saveState }),
  setPendingSuggestion: (pendingSuggestion) => set({ pendingSuggestion }),
}));
