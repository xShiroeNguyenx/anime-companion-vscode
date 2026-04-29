import * as vscode from 'vscode';
import { log } from './log';

// Minimal subset of the VS Code Git extension API surface we need.
interface GitChange {
  uri: vscode.Uri;
}
interface Repository {
  state: {
    HEAD?: { name?: string; commit?: string; ahead?: number; behind?: number };
    workingTreeChanges: GitChange[];
    indexChanges: GitChange[];
  };
  pull(): Promise<void>;
  push(): Promise<void>;
  commit(message: string): Promise<void>;
  add(resources: string[]): Promise<void>;
}
interface GitAPI {
  repositories: Repository[];
}

async function getActiveRepo(): Promise<Repository | null> {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (!gitExt) return null;
  const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
  const api: GitAPI = git.getAPI(1);
  return api?.repositories?.[0] ?? null;
}

export type Bubble = (text: string) => void;
export type ConfirmProtectedBranch = (branch: string) => Promise<boolean>;
export type ConfirmStageAll = (unstagedCount: number) => Promise<boolean>;
export type PromptCommitMessage = (stagedCount: number) => Promise<string | undefined>;

// Wrap repo.pull() with progress notification + before/after state diff so the
// user gets a clear bubble and toast about whether anything actually changed.
export async function pullWithFeedback(bubble: Bubble): Promise<void> {
  const repo = await getActiveRepo();
  if (!repo) {
    bubble('Không tìm thấy git repository ở đây~ 🤔');
    vscode.window.showWarningMessage('Anime Companion: no Git repository in this workspace.');
    return;
  }

  const beforeCommit = repo.state.HEAD?.commit;
  const beforeBehind = repo.state.HEAD?.behind ?? 0;
  const branch = repo.state.HEAD?.name ?? 'HEAD';

  bubble('Đang kéo code mới về nè~ ⬇️');
  log(`git pull: branch=${branch}, behind=${beforeBehind}, commit=${beforeCommit?.slice(0, 7)}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `🌸 Đang pull ${branch}...`,
        cancellable: false,
      },
      () => repo.pull()
    );

    const afterCommit = repo.state.HEAD?.commit;
    log(`git pull done: commit=${afterCommit?.slice(0, 7)}`);

    if (beforeCommit && afterCommit && beforeCommit !== afterCommit) {
      const count = beforeBehind > 0 ? `${beforeBehind} commit` : 'commit mới';
      bubble(`Pull xong! ${count} đã về rồi nha~ ✨`);
      vscode.window.showInformationMessage(`🌸 Pulled ${branch} successfully (${count}).`);
    } else {
      bubble('Đã up-to-date rồi! Không có gì mới~ 💚');
      vscode.window.showInformationMessage(`🌸 ${branch} is already up-to-date.`);
    }
  } catch (err) {
    const fullMsg = err instanceof Error ? err.message : String(err);
    const firstLine = fullMsg.split('\n')[0];
    log(`git pull failed: ${fullMsg}`);
    bubble(`Pull lỗi rồi: ${firstLine} 😭`);
    vscode.window.showErrorMessage(`Anime Companion: Git pull failed — ${firstLine}`);
  }
}

// Branches where committing directly is almost always a mistake — show a
// blocking modal warning first so the user has a chance to bail out and
// switch to a feature branch instead.
const PROTECTED_BRANCHES = new Set(['master', 'main', 'production']);

// Drives the full commit flow: detect state, optionally stage, prompt for
// message, run commit, report result. Designed to give clear feedback for
// every branch (nothing to do / unstaged-only / has-staged / cancelled / error).
export async function commitWithFeedback(
  bubble: Bubble,
  confirmProtectedBranch?: ConfirmProtectedBranch,
  confirmStageAll?: ConfirmStageAll,
  promptCommitMessage?: PromptCommitMessage
): Promise<void> {
  const repo = await getActiveRepo();
  if (!repo) {
    bubble('Không tìm thấy git repository ở đây~ 🤔');
    vscode.window.showWarningMessage('Anime Companion: no Git repository in this workspace.');
    return;
  }

  const stagedCount = repo.state.indexChanges.length;
  const unstagedCount = repo.state.workingTreeChanges.length;
  const branch = repo.state.HEAD?.name ?? '';
  log(`git commit: branch=${branch}, staged=${stagedCount}, unstaged=${unstagedCount}`);

  // 1. Nothing to commit at all
  if (stagedCount === 0 && unstagedCount === 0) {
    bubble('Không có gì để commit hết á! Working tree sạch boong~ ✨');
    vscode.window.showInformationMessage('🌸 Nothing to commit — working tree clean.');
    return;
  }

  // 2. Protected branch guard — make user explicitly confirm
  if (PROTECTED_BRANCHES.has(branch)) {
    const confirmed = confirmProtectedBranch
      ? await confirmProtectedBranch(branch)
      : (await vscode.window.showWarningMessage(
          `⚠️ Bạn đang ở branch "${branch}" (protected). Commit thẳng vào đây thường là không nên — bạn nên tạo feature branch và mở PR. Vẫn muốn commit?`,
          { modal: true },
          'OK, commit thẳng'
        )) === 'OK, commit thẳng';
    if (!confirmed) {
      bubble(`Khôn ghê! Không commit thẳng lên ${branch} đâu~ Tạo branch mới đi nha 🌿`);
      log(`git commit cancelled by protected-branch guard (${branch})`);
      return;
    }
    log(`git commit: protected-branch guard bypassed for ${branch}`);
  }

  // 2. Only unstaged changes — ask whether to stage-all-and-commit
  if (stagedCount === 0 && unstagedCount > 0) {
    const approved = confirmStageAll
      ? await confirmStageAll(unstagedCount)
      : (await vscode.window.showInformationMessage(
          `🌸 Có ${unstagedCount} file thay đổi nhưng chưa stage (git add). Stage tất cả rồi commit?`,
          'Stage all & commit',
          'Hủy'
        )) === 'Stage all & commit';
    if (!approved) {
      bubble('OK, không commit thì thôi~ 🙃');
      return;
    }
    const paths = repo.state.workingTreeChanges
      .map(c => c.uri?.fsPath)
      .filter((p): p is string => Boolean(p));
    try {
      await repo.add(paths);
      log(`git add: staged ${paths.length} file(s)`);
    } catch (err) {
      const fullMsg = err instanceof Error ? err.message : String(err);
      log(`git add failed: ${fullMsg}`);
      bubble(`Stage lỗi rồi: ${fullMsg.split('\n')[0]} 😭`);
      vscode.window.showErrorMessage(`Anime Companion: Git stage failed — ${fullMsg.split('\n')[0]}`);
      return;
    }
  }

  // 3. Has staged changes (either pre-existing or just staged) — prompt for message
  const totalStaged = stagedCount > 0 ? stagedCount : unstagedCount;
  const message = promptCommitMessage
    ? await promptCommitMessage(totalStaged)
    : await vscode.window.showInputBox({
        prompt: `🌸 Commit message (${totalStaged} file đã staged)`,
        placeHolder: 'Nhập message rõ ràng nha~ vd: "fix login bug"',
        validateInput: (v) => v.trim().length === 0 ? 'Message không được để trống' : null,
      });

  if (!message || message.trim().length === 0) {
    bubble('Hủy commit rồi á~ Không sao 🙃');
    return;
  }

  const shortMsg = message.length > 40 ? message.slice(0, 40) + '…' : message;
  bubble(`Đang commit "${shortMsg}"~ 📦`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `🌸 Đang commit...`,
        cancellable: false,
      },
      () => repo.commit(message)
    );
    const hash = repo.state.HEAD?.commit?.slice(0, 7) ?? '???????';
    log(`git commit done: ${hash}`);
    bubble(`Commit xong! ${hash} đã ghi sổ rồi nha~ ✅`);
    vscode.window.showInformationMessage(`🌸 Committed ${hash}: ${shortMsg}`);
  } catch (err) {
    const fullMsg = err instanceof Error ? err.message : String(err);
    const firstLine = fullMsg.split('\n')[0];
    log(`git commit failed: ${fullMsg}`);
    bubble(`Commit lỗi rồi: ${firstLine} 😭`);
    vscode.window.showErrorMessage(`Anime Companion: Git commit failed — ${firstLine}`);
  }
}

// Same shape as pullWithFeedback but for push.
export async function pushWithFeedback(bubble: Bubble): Promise<void> {
  const repo = await getActiveRepo();
  if (!repo) {
    bubble('Không tìm thấy git repository ở đây~ 🤔');
    vscode.window.showWarningMessage('Anime Companion: no Git repository in this workspace.');
    return;
  }

  const ahead = repo.state.HEAD?.ahead ?? 0;
  const branch = repo.state.HEAD?.name ?? 'HEAD';

  if (ahead === 0) {
    bubble('Không có commit nào để push hết á~ 🙃');
    vscode.window.showInformationMessage(`🌸 Nothing to push on ${branch}.`);
    return;
  }

  bubble(`Đang push ${ahead} commit lên cloud nè~ ⬆️`);
  log(`git push: branch=${branch}, ahead=${ahead}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `🌸 Đang push ${branch} (${ahead} commit)...`,
        cancellable: false,
      },
      () => repo.push()
    );
    log(`git push done`);
    bubble(`Push thành công! ${ahead} commit đã bay lên mây~ ☁️✨`);
    vscode.window.showInformationMessage(`🌸 Pushed ${ahead} commit(s) to ${branch}.`);
  } catch (err) {
    const fullMsg = err instanceof Error ? err.message : String(err);
    const firstLine = fullMsg.split('\n')[0];
    log(`git push failed: ${fullMsg}`);
    bubble(`Push lỗi rồi: ${firstLine} 😭`);
    vscode.window.showErrorMessage(`Anime Companion: Git push failed — ${firstLine}`);
  }
}
