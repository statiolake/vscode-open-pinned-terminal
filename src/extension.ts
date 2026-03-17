import * as vscode from "vscode";

interface OpenPinnedTerminalArgs {
  cmd?: string[];
  key: string;
  local?: boolean;
  terminalName?: string;
  isTransient?: boolean;
}

const managedTerminals = new Map<string, vscode.Terminal>();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((closed) => {
      for (const [key, terminal] of managedTerminals) {
        if (terminal === closed) {
          managedTerminals.delete(key);
          break;
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "open-pinned-terminal.open",
      async (args: OpenPinnedTerminalArgs) => {
        if (!args?.key) {
          vscode.window.showErrorMessage(
            "open-pinned-terminal.open: 'key' is required"
          );
          return;
        }

        // Check if a managed terminal already exists and is alive.
        const existing = managedTerminals.get(args.key);
        if (existing && existing.exitStatus === undefined) {
          existing.show();
          return;
        }

        // Determine cwd.
        const cwd = resolveCwd(args.local ?? false);
        if (cwd === "error") {
          return; // error already shown
        }

        // Create terminal.
        const terminal = vscode.window.createTerminal({
          name: args.terminalName ?? args.key,
          cwd: cwd ?? undefined,
          isTransient: args.isTransient ?? false,
        });
        managedTerminals.set(args.key, terminal);

        // Move to editor and pin.
        terminal.show();
        await vscode.commands.executeCommand(
          "workbench.action.terminal.moveToEditor"
        );
        await vscode.commands.executeCommand("workbench.action.pinEditor");

        // Run command if specified.
        if (args.cmd && args.cmd.length > 0) {
          terminal.sendText(args.cmd.join(" "));
        }
      }
    )
  );
}

/**
 * Resolve the cwd for terminal creation.
 *
 * Returns:
 * - A Uri for the cwd
 * - null to let VS Code pick the default (remote workspace)
 * - "error" if we can't determine the cwd and should abort
 */
function resolveCwd(local: boolean): vscode.Uri | null | "error" {
  if (!local) {
    // Let VS Code decide — when connected to remote, this creates a remote terminal.
    return null;
  }

  const remoteName = vscode.env.remoteName;

  if (!remoteName) {
    // Not connected to remote. workspaceFolders[0].uri is file:// already.
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.uri ?? null;
  }

  if (remoteName === "dev-container") {
    const localUri = getLocalCwdFromDevContainer();
    if (localUri) {
      return localUri;
    }
    vscode.window.showErrorMessage(
      "open-pinned-terminal: Failed to resolve local workspace path from Dev Container URI"
    );
    return "error";
  }

  // Unsupported remote type.
  vscode.window.showErrorMessage(
    `open-pinned-terminal: local terminal is not supported for remote type '${remoteName}'`
  );
  return "error";
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
function getLocalCwdFromDevContainer(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;

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
