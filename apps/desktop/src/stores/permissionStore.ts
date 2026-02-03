import { create } from 'zustand';

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  detail: string;
  timeoutSec: number;
}

interface PermissionState {
  pendingRequest: PermissionRequest | null;

  // Actions
  setPendingRequest: (request: PermissionRequest | null) => void;
  clearRequest: () => void;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  pendingRequest: null,

  setPendingRequest: (request) => set({ pendingRequest: request }),

  clearRequest: () => set({ pendingRequest: null }),
}));
