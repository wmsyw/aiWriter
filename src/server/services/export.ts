import { prisma } from '../db';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import epub from 'epub-gen-memory';

export type ExportFormat = 'txt' | 'md' | 'epub' | 'docx';

interface NovelWithChapters {
  id: string;
  title: string;
  chapters: Array<{ title: string; content: string }>;
}

async function generateEpub(novel: NovelWithChapters): Promise<Buffer> {
  const chapters = novel.chapters.map(ch => ({
    title: ch.title,
    content: `<h1>${escapeHtml(ch.title)}</h1>${ch.content.split('\n').map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : '').join('')}`,
  }));

  const buffer = await epub(
    {
      title: novel.title,
      author: 'AI Writer',
      lang: 'zh-CN',
    },
    chapters
  );

  return buffer;
}

async function generateDocx(novel: NovelWithChapters): Promise<Buffer> {
  const children = novel.chapters.flatMap(ch => [
    new Paragraph({
      text: ch.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }),
    ...ch.content
      .split('\n')
      .filter(Boolean)
      .map(
        p =>
          new Paragraph({
            children: [new TextRun({ text: p, size: 24 })],
            spacing: { after: 120 },
          })
      ),
  ]);

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBuffer(doc);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function exportNovel(
  userId: string,
  novelId: string,
  format: ExportFormat,
  chapterIds?: string[]
): Promise<string | Buffer> {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId },
    include: {
      chapters: {
        where: chapterIds ? { id: { in: chapterIds } } : undefined,
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!novel) throw new Error('Novel not found');

  switch (format) {
    case 'txt':
      return novel.chapters.map(c => `${c.title}\n\n${c.content}\n\n`).join('\n');

    case 'md':
      return `# ${novel.title}\n\n` + novel.chapters.map(c => `## ${c.title}\n\n${c.content}\n\n`).join('\n');

    case 'epub':
      return await generateEpub(novel);

    case 'docx':
      return await generateDocx(novel);

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
