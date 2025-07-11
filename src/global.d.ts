/// <reference types="@sveltejs/kit" />

interface Window {
  electronAPI?: {
    saveFile: (data: {
      content: string;
      format: string;
      defaultPath?: string;
    }) => Promise<{ success: boolean; path?: string; error?: string }>;
  };
}
