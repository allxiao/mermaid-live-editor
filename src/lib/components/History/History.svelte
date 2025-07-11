<script lang="ts">
  import Card from '$lib/components/Card/Card.svelte';
  import type { HistoryEntry, HistoryType, State, Tab } from '$lib/types';
  import { notify, prompt } from '$lib/util/notify';
  import { getStateString, inputStateStore } from '$lib/util/state';
  import { logEvent } from '$lib/util/stats';
  import dayjs from 'dayjs';
  import dayjsRelativeTime from 'dayjs/plugin/relativeTime';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import BookmarkIcon from '~icons/material-symbols/bookmark-outline-rounded';
  import TrashAltIcon from '~icons/material-symbols/delete-outline-rounded';
  import DownloadIcon from '~icons/material-symbols/download-rounded';
  import SaveIcon from '~icons/material-symbols/save-outline-rounded';
  import UndoIcon from '~icons/material-symbols/settings-backup-restore-rounded';
  import UploadIcon from '~icons/material-symbols/upload-rounded';
  import FolderOpenIcon from '~icons/material-symbols/folder-open-outline-rounded';
  import FileSaveIcon from '~icons/material-symbols/file-save-outline-rounded';
  import SaveAsIcon from '~icons/material-symbols/save-as-outline-rounded';
  import HistoryIcon from '~icons/mdi/clock-outline';
  import GitAltIcon from '~icons/mdi/git';
  import { Button } from '../ui/button';
  import { Separator } from '../ui/separator';
  import {
    addHistoryEntry,
    clearHistoryData,
    getPreviousState,
    historyModeStore,
    historyStore,
    loaderHistoryStore,
    restoreHistory
  } from './history';

  dayjs.extend(dayjsRelativeTime);

  const HISTORY_SAVE_INTERVAL = 60_000;

  const tabSelectHandler = (tab: Tab) => {
    historyModeStore.set(tab.id as HistoryType);
  };

  let tabs: Tab[] = $state([
    {
      id: 'manual',
      title: 'Saved',
      icon: BookmarkIcon
    },
    {
      id: 'auto',
      title: 'Timeline',
      icon: HistoryIcon
    }
  ]);

  // Track the linked file for display
  let linkedFile: string | null = $state(null);

  // Subscribe to changes in the state to update the linked file
  inputStateStore.subscribe((state) => {
    if (state && typeof state === 'object' && 'linkedFile' in state) {
      linkedFile = (state as State).linkedFile;

      // Update the window title when linkedFile changes
      if (window.electronAPI && window.electronAPI.setWindowTitle) {
        if (linkedFile) {
          // Extract just the filename from the path
          const fileName = linkedFile.split(/[/\\]/).pop();
          window.electronAPI.setWindowTitle(fileName);
        } else {
          window.electronAPI.setWindowTitle(); // Reset to default title
        }
      }
    }
  });

  const openFile = () => {
    if (window.electronAPI && window.electronAPI.openFile) {
      window.electronAPI
        .openFile()
        .then((result) => {
          if (result.success && result.data) {
            result.data.linkedFile = result.path;
            restoreHistoryItem(result.data);

            notify(`File loaded from ${result.path}`);
            logEvent('history', {
              action: 'openFile',
              success: true
            });
          } else if (result.error) {
            notify(`Failed to open file: ${result.error}`);
            logEvent('history', {
              action: 'openFile',
              success: false,
              error: result.error
            });
          }
        })
        .catch((error) => {
          notify(`Error opening file: ${error.message}`);
          logEvent('history', {
            action: 'openFile',
            success: false,
            error: error.message
          });
        });
    } else {
      // Fallback to browser upload if not in Electron
      uploadHistory();
    }
  };

  const saveToFile = () => {
    const currentState: string = getStateString();
    const state = get(inputStateStore) as State;
    const linkedFile = state.linkedFile;

    if (window.electronAPI && window.electronAPI.saveFile) {
      // If we have a linked file, save directly to it without showing the dialog
      window.electronAPI
        .saveFile({
          content: currentState,
          format: 'json',
          defaultPath: linkedFile || `mermaid-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`,
          skipDialog: !!linkedFile // Skip dialog if we have a linked file
        })
        .then((result) => {
          if (result.success) {
            // Update the linkedFile property
            if (result.path) {
              inputStateStore.update((state) => ({
                ...state,
                linkedFile: result.path
              }));
            }

            notify(`File saved to ${result.path}`);
            logEvent('history', {
              action: 'saveToFile',
              success: true
            });
          } else if (result.error) {
            notify(`Failed to save: ${result.error}`);
            logEvent('history', {
              action: 'saveToFile',
              success: false,
              error: result.error
            });
          }
        })
        .catch((error) => {
          notify(`Error saving file: ${error.message}`);
          logEvent('history', {
            action: 'saveToFile',
            success: false,
            error: error.message
          });
        });
    } else {
      // Fallback to browser download if not in Electron
      downloadHistory();
    }
  };

  // Add saveAsToFile function
  const saveAsToFile = () => {
    const currentState: string = getStateString();
    const state = get(inputStateStore) as State;
    const linkedFile = state.linkedFile;

    if (window.electronAPI && window.electronAPI.saveFile) {
      window.electronAPI
        .saveFile({
          content: currentState,
          format: 'json',
          defaultPath: linkedFile || `mermaid-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`,
          skipDialog: false // Always show the dialog for Save As
        })
        .then((result) => {
          if (result.success) {
            // Update the linkedFile property
            if (result.path) {
              inputStateStore.update((state) => ({
                ...state,
                linkedFile: result.path
              }));
            }

            notify(`File saved to ${result.path}`);
            logEvent('history', {
              action: 'saveAsToFile',
              success: true
            });
          } else if (result.error) {
            notify(`Failed to save: ${result.error}`);
            logEvent('history', {
              action: 'saveAsToFile',
              success: false,
              error: result.error
            });
          }
        })
        .catch((error) => {
          notify(`Error saving file: ${error.message}`);
          logEvent('history', {
            action: 'saveAsToFile',
            success: false,
            error: error.message
          });
        });
    } else {
      // Fallback to browser download if not in Electron
      downloadHistory();
    }
  };

  const downloadHistory = () => {
    const data = get(historyStore);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-history-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent('history', {
      action: 'download'
    });
  };

  const uploadHistory = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async ({ target }: Event) => {
      const file = (target as HTMLInputElement)?.files?.[0];
      if (!file) {
        return;
      }
      const data: HistoryEntry[] = JSON.parse(await file.text());
      restoreHistory(data);
    });
    input.click();
  };

  const saveHistory = (auto = false) => {
    const currentState: string = getStateString();
    const previousState: string = getPreviousState(auto);
    if (previousState !== currentState) {
      addHistoryEntry({
        state: $inputStateStore,
        time: Date.now(),
        type: auto ? 'auto' : 'manual'
      });
    } else if (!auto) {
      notify('State already saved.');
    }
  };

  const clearHistory = (id?: string): void => {
    if (!id && !prompt('Clear all saved items?')) {
      return;
    }
    clearHistoryData(id);
  };

  const restoreHistoryItem = (state: State): void => {
    inputStateStore.set({ ...state, updateDiagram: true });
  };

  onMount(() => {
    historyModeStore.set('manual');
    setInterval(() => {
      saveHistory(true);
    }, HISTORY_SAVE_INTERVAL);
  });

  loaderHistoryStore.subscribe((entries) => {
    if (entries.length > 0 && tabs.length === 2) {
      tabs = [
        {
          id: 'loader',
          title: 'Revisions',
          icon: GitAltIcon
        },
        ...tabs
      ];
      historyModeStore.set('loader');
    }
  });
</script>

<Card onselect={tabSelectHandler} isOpen isClosable={false} {tabs}>
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <Button size="icon" variant="ghost" id="openFile" onclick={openFile} title="Open File">
        <FolderOpenIcon />
      </Button>
      <Button size="icon" variant="ghost" id="saveToFile" onclick={saveToFile} title="Save to File">
        <FileSaveIcon />
      </Button>
      {#if linkedFile}
        <Button
          size="icon"
          variant="ghost"
          id="saveAsToFile"
          onclick={saveAsToFile}
          title="Save As...">
          <SaveAsIcon />
        </Button>
      {/if}
      <Button
        size="icon"
        variant="ghost"
        id="uploadHistory"
        onclick={uploadHistory}
        title="Upload history"><UploadIcon /></Button>
      {#if $historyStore.length > 0}
        <Button
          id="downloadHistory"
          size="icon"
          variant="ghost"
          onclick={downloadHistory}
          title="Download history"><DownloadIcon /></Button>
      {/if}
      <Separator orientation="vertical" />
      <Button
        id="saveHistory"
        size="icon"
        variant="ghost"
        onclick={() => saveHistory()}
        title="Save current state"><SaveIcon /></Button>
      {#if $historyModeStore !== 'loader'}
        <Button
          id="clearHistory"
          size="icon"
          variant="ghost"
          class="hover:text-destructive"
          onclick={() => clearHistory()}
          title="Delete all saved states"><TrashAltIcon /></Button>
      {/if}
    </div>
  {/snippet}

  {#if linkedFile}
    <div class="border-b border-primary-foreground/10 px-4 py-2 text-xs text-primary-foreground/50">
      <span class="font-medium">Linked file:</span>
      {linkedFile}
    </div>
  {/if}

  <ul class="flex h-full min-w-fit flex-col gap-2 overflow-auto p-2" id="historyList">
    {#if $historyStore.length > 0}
      {#each $historyStore as { id, state, time, name, url, type } (id)}
        <li class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              {#if url}
                <a
                  href={url}
                  target="_blank"
                  title="Open revision in new tab"
                  class="text-blue-500 hover:underline">{name}</a>
              {:else}
                <span class="whitespace-nowrap">{name}</span>
              {/if}
              <span class="whitespace-nowrap text-xs text-primary-foreground/30">
                {new Date(time).toLocaleString()}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="whitespace-nowrap text-sm text-primary-foreground/50">
                {dayjs(time).fromNow()}
              </span>
              <Button size="icon" variant="ghost" onclick={() => restoreHistoryItem(state)}>
                <UndoIcon />
              </Button>
              {#if type !== 'loader'}
                <Button
                  size="icon"
                  variant="ghost"
                  class="hover:text-destructive"
                  onclick={() => clearHistory(id)}>
                  <TrashAltIcon />
                </Button>
              {/if}
            </div>
          </div>
          <Separator />
        </li>
      {/each}
    {:else}
      <div class="m-2 text-center">
        No items in History<br />
        Click the Save button to save current state and restore it later.<br />
        Timeline will automatically be saved every minute.
      </div>
    {/if}
  </ul>
</Card>
