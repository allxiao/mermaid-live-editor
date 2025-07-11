/// <reference types="@sveltejs/kit" />

interface Window {
  electronAPI?: {
    saveFile: (data: {
      content: string;
      format: string;
      defaultPath?: string;
      skipDialog?: boolean;
    }) => Promise<{ success: boolean; path?: string; error?: string }>;
    openFile: () => Promise<{
      success: boolean;
      path?: string;
      data?: import('$lib/types').State;
      error?: string;
    }>;
    setWindowTitle: (title?: string) => Promise<{ success: boolean; error?: string }>;
  };
}
