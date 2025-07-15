<script lang="ts">
  import Actions from '$/components/Actions.svelte';
  import Card from '$/components/Card/Card.svelte';
  import DiagramDocButton from '$/components/DiagramDocumentationButton.svelte';
  import Editor from '$/components/Editor.svelte';
  import History from '$/components/History/History.svelte';
  import McWrapper from '$/components/McWrapper.svelte';
  import MermaidChartIcon from '$/components/MermaidChartIcon.svelte';
  import Navbar from '$/components/Navbar.svelte';
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import Preset from '$/components/Preset.svelte';
  import Share from '$/components/Share.svelte';
  import SyncRoughToolbar from '$/components/SyncRoughToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import * as Resizable from '$/components/ui/resizable';
  import { Switch } from '$/components/ui/switch';
  import { Toggle } from '$/components/ui/toggle';
  import VersionSecurityToolbar from '$/components/VersionSecurityToolbar.svelte';
  import View from '$/components/View.svelte';
  import type { EditorMode, State, Tab } from '$/types';
  import { PanZoomState } from '$/util/panZoom';
  import { notify } from '$/util/notify';
  import {
    getStateString,
    inputStateStore,
    defaultState,
    stateStore,
    updateCodeStore,
    urlsStore
  } from '$/util/state';
  import { logEvent } from '$/util/stats';
  import { initHandler } from '$/util/util';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import CodeIcon from '~icons/custom/code';
  import HistoryIcon from '~icons/material-symbols/history';
  import GearIcon from '~icons/material-symbols/settings-outline-rounded';
  import FileAddIcon from '~icons/material-symbols/note-add-outline-rounded';
  import FolderOpenIcon from '~icons/material-symbols/folder-open-outline-rounded';
  import FileSaveIcon from '~icons/material-symbols/file-save-outline-rounded';
  import SaveAsIcon from '~icons/material-symbols/save-as-outline-rounded';
  import { addHistoryEntry } from '$/components/History/history';

  const panZoomState = new PanZoomState();

  const tabSelectHandler = (tab: Tab) => {
    const editorMode: EditorMode = tab.id === 'code' ? 'code' : 'config';
    updateCodeStore({ editorMode });
  };

  const editorTabs: Tab[] = [
    {
      icon: CodeIcon,
      id: 'code',
      title: 'Code'
    },
    {
      icon: GearIcon,
      id: 'config',
      title: 'Config'
    }
  ];

  // Functions for file operations
  const newDiagram = () => {
    inputStateStore.set(defaultState);
    addHistoryEntry({
      state: $inputStateStore,
      time: Date.now(),
      type: 'manual'
    });
    notify('Created new diagram');
    logEvent('history', {
      action: 'newDiagram',
      success: true
    });
  };

  const openFile = () => {
    if (window.electronAPI && window.electronAPI.openFile) {
      window.electronAPI
        .openFile()
        .then((result) => {
          if (result.success && result.data) {
            result.data.linkedFile = result.path ?? '';
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
          notify(`Failed to open file: ${error}`);
        });
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
                linkedFile: result.path ?? ''
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
      // Fallback to browser download
      const downloadHistory = () => {
        const blob = new Blob([currentState], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mermaid-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        logEvent('history', {
          action: 'download'
        });
      };
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
                linkedFile: result.path ?? ''
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
      // Fallback to browser download
      const downloadHistory = () => {
        const blob = new Blob([currentState], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mermaid-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        logEvent('history', {
          action: 'download'
        });
      };
      downloadHistory();
    }
  };

  const restoreHistoryItem = (state: State): void => {
    inputStateStore.set({ ...state, updateDiagram: true });
  };

  let width = $state(0);
  let isMobile = $derived(width < 640);
  let isViewMode = $state(true);

  onMount(async () => {
    await initHandler();
    window.addEventListener('appinstalled', () => {
      logEvent('pwaInstalled', { isMobile });
    });
  });

  let isHistoryOpen = $state(false);

  let editorPane: Resizable.Pane | undefined;
  $effect(() => {
    if (isMobile) {
      editorPane?.resize(50);
    }
  });
</script>

<div class="flex h-full flex-col overflow-hidden">
  {#snippet mobileToggle()}
    <div class="flex items-center gap-2">
      Edit <Switch
        id="editorMode"
        class="data-[state=checked]:bg-accent"
        bind:checked={isViewMode}
        onclick={() => {
          logEvent('mobileViewToggle');
        }} /> View
    </div>
  {/snippet}

  <Navbar mobileToggle={isMobile ? mobileToggle : undefined}>
    <Button size="icon" variant="ghost" id="newDiagram" onclick={newDiagram} title="New Diagram">
      <FileAddIcon />
    </Button>
    <Button size="icon" variant="ghost" id="openFile" onclick={openFile} title="Open...">
      <FolderOpenIcon />
    </Button>
    <Button size="icon" variant="ghost" id="saveToFile" onclick={saveToFile} title="Save">
      <FileSaveIcon />
    </Button>
    {#if $inputStateStore.linkedFile}
      <Button
        size="icon"
        variant="ghost"
        id="saveAsToFile"
        onclick={saveAsToFile}
        title="Save As...">
        <SaveAsIcon />
      </Button>
    {/if}
    <Toggle bind:pressed={isHistoryOpen} size="sm">
      <HistoryIcon />
    </Toggle>
    <Share />
    <McWrapper>
      <Button
        variant="accent"
        size="sm"
        href={$urlsStore.mermaidChart({ medium: 'save_diagram' }).save}
        target="_blank">
        <MermaidChartIcon />
        Save diagram
      </Button>
    </McWrapper>
  </Navbar>

  <div class="flex flex-1 flex-col overflow-hidden" bind:clientWidth={width}>
    <div
      class={[
        'size-full',
        isMobile && ['w-[200%] duration-300', isViewMode && '-translate-x-1/2']
      ]}>
      <Resizable.PaneGroup
        direction="horizontal"
        autoSaveId="liveEditor"
        class="gap-4 p-2 pt-0 sm:gap-0 sm:p-6 sm:pt-0">
        <Resizable.Pane bind:this={editorPane} defaultSize={30} minSize={15}>
          <div class="flex h-full flex-col gap-4 sm:gap-6">
            <Card
              onselect={tabSelectHandler}
              isOpen
              tabs={editorTabs}
              activeTabID={$stateStore.editorMode}
              isClosable={false}>
              {#snippet actions()}
                <DiagramDocButton />
              {/snippet}
              <Editor {isMobile} />
            </Card>

            <div class="group flex flex-wrap justify-between gap-4 sm:gap-6">
              <Preset />
              <Actions />
            </div>
          </div>
        </Resizable.Pane>
        <Resizable.Handle class="mr-1 hidden opacity-0 sm:block" />
        <Resizable.Pane minSize={15} class="relative flex h-full flex-1 flex-col overflow-hidden">
          <View {panZoomState} shouldShowGrid={$stateStore.grid} />
          <div class="absolute right-0 top-0"><PanZoomToolbar {panZoomState} /></div>
          <div class="absolute bottom-0 right-0"><VersionSecurityToolbar /></div>
          <div class="absolute bottom-0 left-0 sm:left-5"><SyncRoughToolbar /></div>
        </Resizable.Pane>
        {#if isHistoryOpen}
          <Resizable.Handle class="ml-1 hidden opacity-0 sm:block" />
          <Resizable.Pane
            minSize={15}
            defaultSize={30}
            class="hidden h-full flex-grow flex-col sm:flex">
            <History />
          </Resizable.Pane>
        {/if}
      </Resizable.PaneGroup>
    </div>
  </div>
</div>
