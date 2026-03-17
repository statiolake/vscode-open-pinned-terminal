# Open Pinned Terminal

A VS Code extension that opens a terminal in the editor area and pins it. Each terminal is identified by a `key`, so the same keybinding always brings up the same terminal instead of creating a new one.

## Features

- Open a terminal as a pinned editor tab
- Reuse an existing terminal by `key` — if it's still alive, it just gets focused
- Optionally run a command on creation
- Support for local terminals in Dev Container environments

## Usage

This extension provides the command `open-pinned-terminal.open`. It is designed to be used via keybindings rather than the Command Palette.

Add a keybinding in `keybindings.json`:

```jsonc
{
  "key": "ctrl+`",
  "command": "open-pinned-terminal.open",
  "args": {
    "key": "main"
  }
}
```

### Arguments

| Argument       | Type       | Required | Default       | Description                                          |
| -------------- | ---------- | -------- | ------------- | ---------------------------------------------------- |
| `key`          | `string`   | Yes      |               | Unique identifier for the terminal instance          |
| `cmd`          | `string[]` | No       |               | Command to run when the terminal is first created     |
| `terminalName` | `string`   | No       | same as `key` | Display name shown on the terminal tab                |
| `local`        | `boolean`  | No       | `false`       | Force a local terminal (useful in Dev Containers)     |
| `isTransient`  | `boolean`  | No       | `false`       | Mark the terminal as transient (not restored on reload) |

### Examples

Open a pinned terminal for Claude Code:

```jsonc
{
  "key": "ctrl+shift+c",
  "command": "open-pinned-terminal.open",
  "args": {
    "key": "claude",
    "terminalName": "Claude Code",
    "cmd": ["claude"]
  }
}
```

Open a pinned terminal for Codex:

```jsonc
{
  "key": "ctrl+shift+x",
  "command": "open-pinned-terminal.open",
  "args": {
    "key": "codex",
    "terminalName": "Codex",
    "cmd": ["codex"]
  }
}
```

Open a local terminal for Claude Code while connected to a Dev Container:

```jsonc
{
  "key": "ctrl+shift+l",
  "command": "open-pinned-terminal.open",
  "args": {
    "key": "claude-local",
    "terminalName": "Claude Code (Local)",
    "cmd": ["claude"],
    "local": true
  }
}
```

## Installation

### From VSIX

```sh
code --install-extension vscode-open-pinned-terminal-0.1.0.vsix
```

### Build from source

```sh
npm install
npm run package
code --install-extension vscode-open-pinned-terminal-*.vsix
```

## License

MIT
