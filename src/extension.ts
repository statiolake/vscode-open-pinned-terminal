import * as vscode from "vscode";

interface OpenPinnedTerminalArgs {
  cmd?: string[];
  key: string;
  forceNew?: boolean;
  local?: boolean;
  terminalName?: string;
  isTransient?: boolean;
}

interface ManagedTerminal {
  terminal: vscode.Terminal;
  familyKey: string;
  index: number;
  name: string;
}

interface TerminalFamily {
  nextIndex: number;
  lastFocusedIndex?: number;
}

const managedTerminals = new Map<string, ManagedTerminal>();
const terminalFamilies = new Map<string, TerminalFamily>();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((closed) => {
      for (const [key, managed] of managedTerminals) {
        if (managed.terminal === closed) {
          managedTerminals.delete(key);
          const family = getTerminalFamily(managed.familyKey);
          if (family.lastFocusedIndex === managed.index) {
            family.lastFocusedIndex = getHighestOpenIndex(managed.familyKey);
          }
          break;
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal((active) => {
      updateLastFocusedTerminal(active);
    }),
  );

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => {
      updateLastFocusedTerminalTab();
    }),
  );

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabGroups(() => {
      updateLastFocusedTerminalTab();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "open-pinned-terminal.open",
      async (args: OpenPinnedTerminalArgs) => {
        if (!args?.key) {
          vscode.window.showErrorMessage(
            "open-pinned-terminal.open: 'key' is required",
          );
          return;
        }

        if (args.key.includes(":")) {
          vscode.window.showErrorMessage(
            "open-pinned-terminal.open: 'key' must not contain ':'",
          );
          return;
        }

        const forceNew = args.forceNew ?? false;
        const key = forceNew
          ? undefined
          : getManagedTerminalKey(args.key, forceNew);

        const existing = key ? managedTerminals.get(key.fullKey) : undefined;
        if (existing && existing.terminal.exitStatus === undefined) {
          existing.terminal.show();
          updateLastFocusedManagedTerminal(existing);
          return;
        }

        // Determine cwd.
        const cwd = await resolveCwd(args.local ?? false);
        if (cwd === "abort") {
          return; // error already shown or user cancelled
        }

        // Create terminal.
        const newKey = key ?? getManagedTerminalKey(args.key, forceNew);
        const terminalName = getTerminalName(args.terminalName, newKey);
        const terminal = vscode.window.createTerminal({
          name: terminalName,
          cwd: cwd ?? undefined,
          location: vscode.TerminalLocation.Editor,
          isTransient: args.isTransient ?? false,
        });
        managedTerminals.set(newKey.fullKey, {
          terminal,
          familyKey: newKey.familyKey,
          index: newKey.index,
          name: terminalName,
        });
        updateLastFocusedManagedTerminal(managedTerminals.get(newKey.fullKey)!);

        // Show and pin the editor terminal.
        terminal.show();
        await vscode.commands.executeCommand("workbench.action.pinEditor");

        // Run command if specified.
        if (args.cmd && args.cmd.length > 0) {
          terminal.sendText(`${args.cmd.join(" ")}; exit`);
        }
      },
    ),
  );
}

/**
 * Resolve the cwd for terminal creation.
 *
 * Returns:
 * - A Uri for the cwd
 * - null to let VS Code pick the default when there is no workspace folder
 * - "abort" if we can't determine the cwd or the user cancelled
 */
async function resolveCwd(local: boolean): Promise<vscode.Uri | null | "abort"> {
  const folder = await selectWorkspaceFolder();
  if (folder === "cancelled") return "abort";

  if (!local) return folder?.uri ?? null;

  const remoteName = vscode.env.remoteName;

  if (!remoteName) {
    return folder?.uri ?? null;
  }

  if (remoteName === "dev-container") {
    const localUri = folder ? getLocalCwdFromDevContainer(folder) : undefined;
    if (localUri) {
      return localUri;
    }
    vscode.window.showErrorMessage(
      "open-pinned-terminal: Failed to resolve local workspace path from Dev Container URI",
    );
    return "abort";
  }

  // Unsupported remote type.
  vscode.window.showErrorMessage(
    `open-pinned-terminal: local terminal is not supported for remote type '${remoteName}'`,
  );
  return "abort";
}

async function selectWorkspaceFolder(): Promise<
  vscode.WorkspaceFolder | undefined | "cancelled"
> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  if (folders.length === 1) return folders[0];

  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath || folder.uri.path,
      folder,
    })),
    {
      placeHolder: "Select workspace folder for the terminal",
    },
  );

  return picked?.folder ?? "cancelled";
}

/**
 * Decode the local host path from a Dev Container's vscode-remote:// URI.
 *
 * Dev Container URIs have the form:
 *   vscode-remote://dev-container+<hex-encoded-payload>[@parentAuthority]/path
 *
 * The hex payload decodes to either:
 * - A plain string: the hostPath directly
 * - A JSON object: { hostPath: string, settings?: ..., configFile?: ... }
 *
 * This encoding is defined in devcontainers/cli (OSS).
 */
function getLocalCwdFromDevContainer(
  folder: vscode.WorkspaceFolder,
): vscode.Uri | undefined {
  const uri = folder.uri;
  if (uri.scheme !== "vscode-remote") return undefined;

  // Extract hex payload from authority: "dev-container+<hex>[@parentAuthority]"
  const match = uri.authority.match(/^dev-container\+([0-9a-fA-F]+)/);
  if (!match) return undefined;

  try {
    const decoded = Buffer.from(match[1], "hex").toString("utf8");
    const hostPath = decoded.startsWith("{")
      ? (JSON.parse(decoded) as { hostPath?: string }).hostPath
      : decoded;

    if (!hostPath) return undefined;
    return vscode.Uri.file(hostPath);
  } catch {
    return undefined;
  }
}

export function deactivate() {}

function getManagedTerminalKey(
  familyKey: string,
  forceNew: boolean,
): { fullKey: string; familyKey: string; index: number } {
  const family = getTerminalFamily(familyKey);

  if (forceNew) {
    return allocateTerminalKey(familyKey, family);
  }

  const activeTab = getManagedTerminalFromActiveTab();
  if (activeTab?.familyKey === familyKey) {
    const nextIndex = getNextOpenIndex(familyKey, activeTab.index);
    if (nextIndex !== undefined) {
      return getTerminalKeyAtIndex(familyKey, nextIndex);
    }
  }

  if (
    family.lastFocusedIndex !== undefined &&
    isOpenTerminalKey(familyKey, family.lastFocusedIndex)
  ) {
    return getTerminalKeyAtIndex(familyKey, family.lastFocusedIndex);
  }

  return getTerminalKeyAtIndex(familyKey, 0);
}

function allocateTerminalKey(
  familyKey: string,
  family: TerminalFamily,
): { fullKey: string; familyKey: string; index: number } {
  const index = family.nextIndex;
  family.nextIndex += 1;
  return { fullKey: `${familyKey}:${index}`, familyKey, index };
}

function getTerminalKeyAtIndex(
  familyKey: string,
  index: number,
): { fullKey: string; familyKey: string; index: number } {
  const family = getTerminalFamily(familyKey);
  family.nextIndex = Math.max(family.nextIndex, index + 1);
  return { fullKey: `${familyKey}:${index}`, familyKey, index };
}

function getTerminalName(
  terminalName: string | undefined,
  key: { fullKey: string; index: number },
): string {
  if (!terminalName) {
    return key.fullKey;
  }

  return `${terminalName}:${key.index}`;
}

function getTerminalFamily(familyKey: string): TerminalFamily {
  let family = terminalFamilies.get(familyKey);
  if (!family) {
    family = { nextIndex: 0 };
    terminalFamilies.set(familyKey, family);
  }
  return family;
}

function getManagedTerminalByTerminal(
  terminal: vscode.Terminal,
): ManagedTerminal | undefined {
  for (const managed of managedTerminals.values()) {
    if (managed.terminal === terminal) {
      return managed;
    }
  }
  return undefined;
}

function getManagedTerminalFromActiveTab(): ManagedTerminal | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!(tab?.input instanceof vscode.TabInputTerminal)) {
    return undefined;
  }

  return getManagedTerminalByName(tab.label);
}

function getManagedTerminalByName(name: string): ManagedTerminal | undefined {
  for (const managed of managedTerminals.values()) {
    if (managed.name === name) {
      return managed;
    }
  }
  return undefined;
}

function updateLastFocusedTerminal(
  terminal: vscode.Terminal | undefined,
): void {
  if (!terminal) {
    return;
  }

  const managed = getManagedTerminalByTerminal(terminal);
  if (managed) {
    updateLastFocusedManagedTerminal(managed);
  }
}

function updateLastFocusedTerminalTab(): void {
  const managed = getManagedTerminalFromActiveTab();
  if (managed) {
    updateLastFocusedManagedTerminal(managed);
  }
}

function updateLastFocusedManagedTerminal(managed: ManagedTerminal): void {
  getTerminalFamily(managed.familyKey).lastFocusedIndex = managed.index;
}

function getHighestOpenIndex(familyKey: string): number | undefined {
  let highest: number | undefined;
  for (const managed of managedTerminals.values()) {
    if (managed.familyKey !== familyKey) {
      continue;
    }

    highest = Math.max(highest ?? managed.index, managed.index);
  }
  return highest;
}

function getNextOpenIndex(
  familyKey: string,
  currentIndex: number,
): number | undefined {
  let next: number | undefined;
  let first: number | undefined;

  for (const managed of managedTerminals.values()) {
    if (managed.familyKey !== familyKey) {
      continue;
    }

    first = Math.min(first ?? managed.index, managed.index);

    if (managed.index > currentIndex) {
      next = Math.min(next ?? managed.index, managed.index);
    }
  }

  return next ?? first;
}

function isOpenTerminalKey(familyKey: string, index: number): boolean {
  return managedTerminals.has(`${familyKey}:${index}`);
}
