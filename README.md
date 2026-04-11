# Open Pinned Terminal

A VS Code extension that opens terminals in the editor area and pins them. Each terminal belongs to a `key` family and is identified as `key:0`, `key:1`, and so on.

## Features

- Open a terminal as a pinned editor tab
- Cycle through existing numbered terminals in a `key` family
- Restore the most recently active terminal in a `key` family when another tab is active
- Force a new numbered terminal when needed
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
| `key`          | `string`   | Yes      |               | Terminal family key. Must not contain `:`            |
| `forceNew`     | `boolean`  | No       | `false`       | Always create the next numbered terminal in the family |
| `cmd`          | `string[]` | No       |               | Command to run when the terminal is first created     |
| `terminalName` | `string`   | No       | same as `key:n` | Display name prefix shown on the terminal tab        |
| `local`        | `boolean`  | No       | `false`       | Force a local terminal (useful in Dev Containers)     |
| `isTransient`  | `boolean`  | No       | `false`       | Mark the terminal as transient (not restored on reload) |

When `forceNew` is `false`, running the command from `codex:n` moves to the next existing `codex:n+1`, wrapping back to the first existing Codex terminal if needed. Running it from another tab restores the most recently active `codex:n`, or creates `codex:0` if none exists yet.

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

Always open the next new Codex terminal, regardless of the active tab:

```jsonc
{
  "key": "ctrl+shift+x",
  "command": "open-pinned-terminal.open",
  "args": {
    "key": "codex",
    "terminalName": "Codex",
    "cmd": ["codex"],
    "forceNew": true
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
