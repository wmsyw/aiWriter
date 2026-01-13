#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function randomPort(min = 10000, max = 60000) {
  return min + Math.floor(Math.random() * (max - min));
}

const CONFIG_SCHEMA = {
  required: [
    {
      key: 'POSTGRES_PORT',
      description: 'PostgreSQL 端口 (随机高位端口)',
      generator: () => String(randomPort(15000, 25000)),
      category: '端口配置',
    },
    {
      key: 'APP_PORT',
      description: '应用服务端口 (随机高位端口)',
      generator: () => String(randomPort(10000, 15000)),
      category: '端口配置',
    },
    {
      key: 'POSTGRES_PASSWORD',
      description: 'PostgreSQL 数据库密码',
      generator: () => crypto.randomBytes(16).toString('hex'),
      category: '数据库配置',
    },
    {
      key: 'DATABASE_URL',
      description: '数据库连接字符串 (自动生成)',
      generator: (config) => `postgresql://postgres:${config.POSTGRES_PASSWORD}@localhost:${config.POSTGRES_PORT}/aiwriter?schema=public`,
      category: '数据库配置',
    },
    {
      key: 'APP_ENCRYPTION_KEY_B64',
      description: 'API Key 加密密钥 (32字节 Base64)',
      generator: () => crypto.randomBytes(32).toString('base64'),
      category: '安全配置',
    },
    {
      key: 'SESSION_SECRET',
      description: 'Session 加密密钥 (64字符随机字符串)',
      generator: () => crypto.randomBytes(32).toString('hex'),
      category: '安全配置',
    },
    {
      key: 'ADMIN_SETUP_TOKEN',
      description: '初始化安装令牌 (首次访问 /setup 时使用)',
      generator: () => crypto.randomBytes(16).toString('hex'),
      category: '安全配置',
    },
  ],
  
  optional: [
    { key: 'NEXT_PUBLIC_APP_URL', description: '应用公开 URL', generator: (config) => `http://localhost:${config.APP_PORT}`, category: '应用配置' },
    { key: 'GIT_BACKUP_ENABLED', description: '是否启用 Git 自动备份', default: 'true', category: 'Git 备份' },
    { key: 'GIT_BACKUP_BASE_PATH', description: 'Git 备份基础路径', default: './data/novels', category: 'Git 备份' },
    { key: 'GIT_BACKUP_USER_NAME', description: 'Git 提交者用户名', default: 'AI Writer', category: 'Git 备份' },
    { key: 'GIT_BACKUP_USER_EMAIL', description: 'Git 提交者邮箱', default: 'backup@aiwriter.local', category: 'Git 备份' },
    { key: 'UPLOAD_DIR', description: '文件上传目录', default: './data/uploads', category: '应用配置' },
    { key: 'SMTP_HOST', description: 'SMTP 服务器地址', default: '', category: '邮件配置' },
    { key: 'SMTP_PORT', description: 'SMTP 端口', default: '587', category: '邮件配置' },
    { key: 'SMTP_USER', description: 'SMTP 用户名', default: '', category: '邮件配置' },
    { key: 'SMTP_PASS', description: 'SMTP 密码', default: '', category: '邮件配置' },
    { key: 'SMTP_FROM', description: '发件人地址', default: 'AI Writer <noreply@aiwriter.local>', category: '邮件配置' },
  ],
};

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', 
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', bgBlue: '\x1b[44m',
};

const S = {
  title: (t) => `${C.bold}${C.cyan}${t}${C.reset}`,
  success: (t) => `${C.green}✓${C.reset} ${t}`,
  warning: (t) => `${C.yellow}⚠${C.reset} ${t}`,
  key: (t) => `${C.bold}${C.blue}${t}${C.reset}`,
  value: (t) => `${C.green}${t}${C.reset}`,
  category: (t) => `${C.bold}${C.magenta}【${t}】${C.reset}`,
  dim: (t) => `${C.dim}${t}${C.reset}`,
  highlight: (t) => `${C.bgBlue}${C.white}${C.bold} ${t} ${C.reset}`,
};

function printBanner() {
  console.log('');
  console.log(S.title('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(S.title('║') + '        🌌 ' + S.highlight('aiWriter') + ' 环境配置生成工具                         ' + S.title('║'));
  console.log(S.title('╚═══════════════════════════════════════════════════════════════╝'));
  console.log('');
}

function printHelp() {
  printBanner();
  console.log('使用方法: node scripts/setup-env.js [选项]\n');
  console.log('选项:');
  console.log('  --force      覆盖已存在的 .env 文件');
  console.log('  --dry-run    仅输出配置，不写入文件');
  console.log('  --minimal    仅生成必需的配置项');
  console.log('  --help       显示此帮助信息\n');
}

function maskSecret(value) {
  if (!value || value.length <= 8) return value;
  return value.substring(0, 4) + '••••••••' + value.substring(value.length - 4);
}

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.category || '其他';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  
  const forceMode = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const minimalMode = args.includes('--minimal');
  
  printBanner();
  
  const projectRoot = path.resolve(__dirname, '..');
  const envPath = path.join(projectRoot, '.env');
  
  if (fs.existsSync(envPath) && !forceMode && !dryRun) {
    console.log(S.warning('.env 文件已存在!'));
    console.log(S.dim('  使用 --force 选项覆盖，或 --dry-run 仅查看生成内容\n'));
    process.exit(1);
  }
  
  console.log(S.dim('正在生成配置...\n'));
  
  const generatedConfig = {};
  const generatedValues = {};
  const outputLines = [
    '# ═══════════════════════════════════════════════════════════════════════════',
    '# aiWriter 环境配置文件',
    '# 生成时间: ' + new Date().toLocaleString('zh-CN'),
    '# ═══════════════════════════════════════════════════════════════════════════',
    '',
  ];
  
  const requiredGroups = groupByCategory(CONFIG_SCHEMA.required);
  for (const [category, items] of Object.entries(requiredGroups)) {
    outputLines.push(`# ${category}`);
    for (const item of items) {
      const value = item.generator ? item.generator(generatedValues) : item.default || '';
      generatedValues[item.key] = value;
      generatedConfig[item.key] = { value, description: item.description, required: true };
      outputLines.push(`${item.key}="${value}"`);
    }
    outputLines.push('');
  }
  
  if (!minimalMode) {
    const optionalGroups = groupByCategory(CONFIG_SCHEMA.optional);
    for (const [category, items] of Object.entries(optionalGroups)) {
      outputLines.push(`# ${category}`);
      for (const item of items) {
        const value = item.generator ? item.generator(generatedValues) : (item.default || '');
        generatedValues[item.key] = value;
        generatedConfig[item.key] = { value, description: item.description, required: false };
        outputLines.push(value ? `${item.key}="${value}"` : `# ${item.key}=""`);
      }
      outputLines.push('');
    }
  }
  
  const envContent = outputLines.join('\n');
  
  if (!dryRun) {
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(S.success(`.env 文件已生成: ${S.dim(envPath)}\n`));
  }
  
  console.log('');
  console.log(S.title('┌─────────────────────────────────────────────────────────────────┐'));
  console.log(S.title('│') + '                    📋 生成的配置内容                          ' + S.title('│'));
  console.log(S.title('└─────────────────────────────────────────────────────────────────┘'));
  console.log('');
  
  console.log(S.category('必需配置 (已自动生成)'));
  console.log('');
  
  const requiredItems = Object.entries(generatedConfig).filter(([_, v]) => v.required);
  for (const [key, { value, description }] of requiredItems) {
    console.log(`  ${S.key(key)}`);
    console.log(`    ${S.dim(description)}`);
    const isSensitive = key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN') || key.includes('PASS');
    console.log(`    ${S.value(isSensitive ? maskSecret(value) : value)}`);
    console.log('');
  }
  
  if (!minimalMode) {
    console.log(S.category('可选配置 (使用默认值)'));
    console.log('');
    const optionalItems = Object.entries(generatedConfig).filter(([_, v]) => !v.required);
    for (const [key, { value }] of optionalItems) {
      console.log(`  ${S.key(key)}: ${value || S.dim('(未设置)')}`);
    }
    console.log('');
  }
  
  console.log('');
  console.log(S.title('┌─────────────────────────────────────────────────────────────────┐'));
  console.log(S.title('│') + '                    ⚠️  重要安全提示                            ' + S.title('│'));
  console.log(S.title('└─────────────────────────────────────────────────────────────────┘'));
  console.log('');
  console.log(`  ${S.warning('请妥善保管以下敏感信息，切勿泄露或提交到版本控制:')}`);
  console.log('');
  console.log(`    • ${S.key('APP_ENCRYPTION_KEY_B64')} - 用于加密 AI API Key`);
  console.log(`    • ${S.key('SESSION_SECRET')} - 用于加密用户会话`);
  console.log(`    • ${S.key('ADMIN_SETUP_TOKEN')} - 用于初始化管理员账户`);
  console.log('');
  
  const setupToken = generatedConfig['ADMIN_SETUP_TOKEN']?.value;
  if (setupToken) {
    console.log(`  ${S.highlight('初始化令牌 (首次访问 /setup 时需要)')}`);
    console.log('');
    console.log(`    ${S.value(setupToken)}`);
    console.log('');
  }
  
  console.log('');
  console.log(S.title('┌─────────────────────────────────────────────────────────────────┐'));
  console.log(S.title('│') + '                    🚀 下一步操作                              ' + S.title('│'));
  console.log(S.title('└─────────────────────────────────────────────────────────────────┘'));
  console.log('');
  
  const appPort = generatedValues['APP_PORT'] || '3000';
  const pgPort = generatedValues['POSTGRES_PORT'] || '5432';
  
  console.log(`  1. 启动 PostgreSQL 数据库 (端口: ${S.value(pgPort)})`);
  console.log('');
  console.log('  2. 初始化数据库:');
  console.log(`     ${S.dim('$')} npx prisma db push`);
  console.log('');
  console.log('  3. 启动应用:');
  console.log(`     ${S.dim('$')} npm run dev:all`);
  console.log('');
  console.log(`  4. 访问 ${S.value(`http://localhost:${appPort}/setup`)} 完成初始化`);
  console.log('');
  console.log(S.dim('─────────────────────────────────────────────────────────────────────'));
  console.log('');
}

main().catch(console.error);
