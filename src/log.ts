import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initLogger(channel: vscode.OutputChannel): void {
  outputChannel = channel;
}

export function log(msg: string): void {
  const stamp = new Date().toISOString().substring(11, 19);
  const line = `[${stamp}] ${msg}`;
  console.log('🌸 ' + line);
  outputChannel?.appendLine(line);
}
