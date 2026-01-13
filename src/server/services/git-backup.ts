import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GitBackupResult {
  commitHash: string;
  filePath: string;
}

const GIT_BACKUP_BASE_PATH = process.env.GIT_BACKUP_BASE_PATH || './data/novels';
const GIT_USER_NAME = process.env.GIT_BACKUP_USER_NAME || 'AI Writer';
const GIT_USER_EMAIL = process.env.GIT_BACKUP_USER_EMAIL || 'backup@aiwriter.local';

const CUID_REGEX = /^c[a-z0-9]{24}$/;

function validateNovelId(novelId: string): void {
  if (!CUID_REGEX.test(novelId)) {
    throw new Error('Invalid novel ID format');
  }
}

function validatePath(basePath: string, targetPath: string): void {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Invalid path');
  }
}

export async function ensureNovelRepo(novelId: string): Promise<SimpleGit> {
  validateNovelId(novelId);
  const repoPath = path.join(GIT_BACKUP_BASE_PATH, novelId);
  validatePath(GIT_BACKUP_BASE_PATH, repoPath);
  
  await fs.mkdir(repoPath, { recursive: true });
  
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo();
  
  if (!isRepo) {
    await git.init();
    await git.addConfig('user.name', GIT_USER_NAME);
    await git.addConfig('user.email', GIT_USER_EMAIL);
  }
  
  return git;
}

export async function commitChapter(
  novelId: string,
  novelTitle: string,
  chapterNumber: number,
  chapterTitle: string,
  content: string
): Promise<GitBackupResult> {
  const git = await ensureNovelRepo(novelId);
  const repoPath = path.join(GIT_BACKUP_BASE_PATH, novelId);
  
  const chaptersDir = path.join(repoPath, 'chapters');
  await fs.mkdir(chaptersDir, { recursive: true });
  
  const safeTitle = chapterTitle.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 50);
  const filename = `${String(chapterNumber).padStart(3, '0')}-${safeTitle}.md`;
  const filePath = path.join(chaptersDir, filename);
  
  const fileContent = `# 第${chapterNumber}章 ${chapterTitle}\n\n${content}`;
  await fs.writeFile(filePath, fileContent, 'utf-8');
  
  const relativeFilePath = `chapters/${filename}`;
  await git.add([relativeFilePath]);
  const commitMessage = `第${chapterNumber}章: ${chapterTitle} - 自动备份`;
  const result = await git.commit(commitMessage);
  
  return {
    commitHash: result.commit || 'initial',
    filePath: relativeFilePath,
  };
}

export async function getCommitHistory(novelId: string, limit = 20): Promise<Array<{
  hash: string;
  date: string;
  message: string;
}>> {
  validateNovelId(novelId);
  const repoPath = path.join(GIT_BACKUP_BASE_PATH, novelId);
  validatePath(GIT_BACKUP_BASE_PATH, repoPath);
  
  try {
    await fs.access(repoPath);
  } catch {
    return [];
  }
  
  const git = simpleGit(repoPath);
  const log = await git.log({ maxCount: limit });
  
  return log.all.map(entry => ({
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
  }));
}

export async function restoreFromCommit(novelId: string, commitHash: string, filePath: string): Promise<string> {
  validateNovelId(novelId);
  const repoPath = path.join(GIT_BACKUP_BASE_PATH, novelId);
  validatePath(GIT_BACKUP_BASE_PATH, repoPath);
  
  const git = simpleGit(repoPath);
  
  const content = await git.show([`${commitHash}:${filePath}`]);
  return content;
}
