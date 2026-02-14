export interface Inspiration {
  name: string;
  theme: string;
  keywords: string[];
  protagonist: string;
  worldSetting: string;
  hook?: string;
  potential?: string;
}

export type InspirationPreset = Pick<
  Inspiration,
  'name' | 'theme' | 'keywords' | 'protagonist' | 'worldSetting'
>;

export interface InspirationOption {
  value: string;
  label: string;
}

export const INSPIRATION_PROGRESS_MESSAGES = [
  '正在分析题材趋势...',
  '正在研究热门元素...',
  '正在构思主角设定...',
  '正在编织世界观...',
  '正在提炼核心卖点...',
  '正在优化创意组合...',
  '即将完成...',
] as const;

export const INSPIRATION_AUDIENCE_OPTIONS: InspirationOption[] = [
  { value: '全年龄', label: '全年龄' },
  { value: '男性读者', label: '男性读者' },
  { value: '女性读者', label: '女性读者' },
  { value: '青少年', label: '青少年' },
  { value: '成年读者', label: '成年读者' },
];

export const INSPIRATION_STYLE_OPTIONS: InspirationOption[] = [
  { value: '', label: '不限风格' },
  { value: '轻松幽默', label: '轻松幽默' },
  { value: '热血燃向', label: '热血燃向' },
  { value: '暗黑压抑', label: '暗黑压抑' },
  { value: '温馨治愈', label: '温馨治愈' },
  { value: '悬疑烧脑', label: '悬疑烧脑' },
  { value: '史诗宏大', label: '史诗宏大' },
  { value: '诙谐讽刺', label: '诙谐讽刺' },
  { value: '细腻文艺', label: '细腻文艺' },
  { value: '硬核写实', label: '硬核写实' },
  { value: '荒诞离奇', label: '荒诞离奇' },
  { value: '浪漫唯美', label: '浪漫唯美' },
  { value: '冷峻凌厉', label: '冷峻凌厉' },
];

export const INSPIRATION_TONE_OPTIONS: InspirationOption[] = [
  { value: '', label: '不限基调' },
  { value: '爽文节奏', label: '爽文节奏' },
  { value: '慢热养成', label: '慢热养成' },
  { value: '虐心虐身', label: '虐心虐身' },
  { value: '甜宠日常', label: '甜宠日常' },
  { value: '权谋争斗', label: '权谋争斗' },
  { value: '热血励志', label: '热血励志' },
  { value: '沉郁悲壮', label: '沉郁悲壮' },
  { value: '轻快欢脱', label: '轻快欢脱' },
  { value: '紧张刺激', label: '紧张刺激' },
  { value: '压抑窒息', label: '压抑窒息' },
  { value: '豁达释然', label: '豁达释然' },
  { value: '苦尽甘来', label: '苦尽甘来' },
  { value: '黑色幽默', label: '黑色幽默' },
];

export const INSPIRATION_PERSPECTIVE_OPTIONS: InspirationOption[] = [
  { value: '', label: '不限视角' },
  { value: '第一人称', label: '第一人称' },
  { value: '第三人称限制', label: '第三人称限制' },
  { value: '第三人称全知', label: '第三人称全知' },
  { value: '多视角切换', label: '多视角切换' },
  { value: '群像文', label: '群像文' },
];

export const INSPIRATION_PRESETS: Record<string, InspirationPreset[]> = {
  玄幻: [
    {
      name: '诡秘复苏',
      theme: '诡异降临，规则怪谈',
      keywords: ['规则怪谈', '诡异', '都市异能', '序列'],
      protagonist: '获得诡异能力的普通人，在规则中求生',
      worldSetting: '诡异复苏的现代世界，规则即是生存法则',
    },
    {
      name: '万古神帝',
      theme: '天骄争霸，万界称尊',
      keywords: ['天骄', '神体', '万界', '称帝'],
      protagonist: '拥有无上神体的天骄，从低谷崛起',
      worldSetting: '万族林立、强者如云的修炼大世界',
    },
  ],
  仙侠: [
    {
      name: '修仙模拟器',
      theme: '无限重生，完美人生',
      keywords: ['模拟器', '无限流', '重生', '完美'],
      protagonist: '获得人生模拟器的修士，可预演推衍',
      worldSetting: '正邪对立的传统修仙世界',
    },
    {
      name: '剑道第一仙',
      theme: '剑道独尊，一剑破万法',
      keywords: ['剑道', '一剑破万法', '逍遥', '天骄'],
      protagonist: '专注剑道的纯粹剑修，以剑证道',
      worldSetting: '百花齐放的修真界，剑道式微待复兴',
    },
  ],
  都市: [
    {
      name: '从外卖员开始',
      theme: '草根逆袭，商业帝国',
      keywords: ['系统', '逆袭', '商战', '暴富'],
      protagonist: '获得金手指的普通打工人',
      worldSetting: '竞争激烈的现代都市商业战场',
    },
    {
      name: '我能看见战力值',
      theme: '都市异能，守护者',
      keywords: ['异能', '觉醒', '都市', '战力'],
      protagonist: '能看到他人属性面板的觉醒者',
      worldSetting: '异能觉醒的近未来都市',
    },
  ],
  历史: [
    {
      name: '家父汉武帝',
      theme: '皇子争霸，王朝崛起',
      keywords: ['皇子', '争霸', '历史', '权谋'],
      protagonist: '穿越成皇子，运用现代知识',
      worldSetting: '风起云涌的大争之世',
    },
    {
      name: '科技改变历史',
      theme: '工业革命，文明跃升',
      keywords: ['科技', '种田', '发展', '争霸'],
      protagonist: '带着现代知识改变历史进程的穿越者',
      worldSetting: '等待开发的古代王朝',
    },
  ],
  科幻: [
    {
      name: '机械飞升',
      theme: '赛博朋克，人机融合',
      keywords: ['赛博朋克', '改造', '义体', '飞升'],
      protagonist: '在义体改造中追寻人性的佣兵',
      worldSetting: '巨型企业统治的赛博朋克未来',
    },
    {
      name: '星门文明',
      theme: '星际探索，文明对决',
      keywords: ['星际', '文明', '虫族', '舰队'],
      protagonist: '指挥人类舰队对抗异族的统帅',
      worldSetting: '星门连接万千星域的宇宙时代',
    },
  ],
  游戏: [
    {
      name: '全民领主',
      theme: '领地经营，争霸天下',
      keywords: ['领主', '建设', '争霸', '全民'],
      protagonist: '获得稀有初始的新晋领主',
      worldSetting: '全球穿越的领主争霸游戏世界',
    },
    {
      name: '无限副本',
      theme: '无限流，副本求生',
      keywords: ['无限流', '副本', '恐怖', '求生'],
      protagonist: '在诡异副本中挣扎求生的玩家',
      worldSetting: '被神秘游戏选中的现实世界',
    },
  ],
  悬疑: [
    {
      name: '诡秘侦探',
      theme: '灵异探案，真相追寻',
      keywords: ['灵异', '探案', '悬疑', '诡秘'],
      protagonist: '能看到死亡线索的特殊侦探',
      worldSetting: '灵异事件频发的现代都市暗面',
    },
    {
      name: '规则怪谈',
      theme: '规则即生存，打破规则',
      keywords: ['规则', '怪谈', '恐怖', '生存'],
      protagonist: '在规则怪谈中寻找真相的普通人',
      worldSetting: '规则与怪谈交织的异常世界',
    },
  ],
  奇幻: [
    {
      name: '魔法工业',
      theme: '魔法与科技的碰撞',
      keywords: ['魔法', '工业', '革命', '领主'],
      protagonist: '用科学思维解析魔法的穿越者',
      worldSetting: '魔法与蒸汽交织的奇幻大陆',
    },
    {
      name: '巫师之路',
      theme: '巫师晋升，真理探索',
      keywords: ['巫师', '晋升', '真理', '冷静'],
      protagonist: '理性冷静追求真理的巫师学徒',
      worldSetting: '巫师塔林立的黑暗中世纪',
    },
  ],
  武侠: [
    {
      name: '江湖烟雨',
      theme: '快意恩仇，侠之大者',
      keywords: ['江湖', '门派', '武学', '侠义'],
      protagonist: '被卷入江湖恩怨的少年侠客',
      worldSetting: '门派林立、武学昌盛的江湖',
    },
    {
      name: '武道巅峰',
      theme: '武道探索，天下第一',
      keywords: ['武道', '突破', '宗师', '争锋'],
      protagonist: '追求武道极致的天才武者',
      worldSetting: '高手如云的武林盛世',
    },
  ],
  言情: [
    {
      name: '重生复仇',
      theme: '重生虐渣，逆袭人生',
      keywords: ['重生', '复仇', '虐渣', '逆袭'],
      protagonist: '重生后看透一切的复仇女主',
      worldSetting: '豪门恩怨的现代都市',
    },
    {
      name: '穿书女配',
      theme: '穿书改命，反派大佬',
      keywords: ['穿书', '女配', '反派', '改命'],
      protagonist: '穿越成炮灰女配的现代人',
      worldSetting: '小说世界的剧情漩涡中心',
    },
  ],
  其他: [
    {
      name: '自由创作',
      theme: '不拘一格',
      keywords: ['创新', '融合', '独特'],
      protagonist: '由你定义的独特主角',
      worldSetting: '由你构建的新世界',
    },
  ],
};

const DEFAULT_GENRE = '其他';

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function parseKeywordsInput(input: string): string[] {
  if (!input.trim()) return [];

  const parts = input.split(/[\n,，、;；]/g);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    const normalized = normalizeText(part);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function formatKeywordsInput(keywords: string[]): string {
  return keywords
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean)
    .join(', ');
}

export function getInspirationPresetsByGenre(genre: string): InspirationPreset[] {
  const normalizedGenre = normalizeText(genre) || DEFAULT_GENRE;
  return INSPIRATION_PRESETS[normalizedGenre] || INSPIRATION_PRESETS[DEFAULT_GENRE] || [];
}

export interface InspirationCacheKeyInput {
  genre: string;
  targetWords: number;
  audience: string;
  keywords: string;
  style: string;
  tone: string;
  perspective: string;
}

export function buildInspirationCacheKey(input: InspirationCacheKeyInput): string {
  const targetWords = Number.isFinite(input.targetWords) ? String(input.targetWords) : '0';

  return [
    normalizeText(input.genre) || DEFAULT_GENRE,
    targetWords,
    normalizeText(input.audience),
    normalizeText(input.keywords),
    normalizeText(input.style),
    normalizeText(input.tone),
    normalizeText(input.perspective),
  ]
    .map((part) => part.toLowerCase())
    .join('|');
}

export interface InspirationKeywordPromptInput {
  keywords: string;
  style: string;
  tone: string;
  perspective: string;
}

export function buildInspirationKeywordsPrompt(input: InspirationKeywordPromptInput): string {
  const requirements = [
    input.style && `写作风格：${normalizeText(input.style)}`,
    input.tone && `情感基调：${normalizeText(input.tone)}`,
    input.perspective && `叙事视角：${normalizeText(input.perspective)}`,
  ]
    .filter(Boolean)
    .join('；');

  return [normalizeText(input.keywords), requirements].filter(Boolean).join('。');
}

function normalizeKeywords(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === 'string' ? normalizeText(item) : ''))
      .filter(Boolean);
  }

  if (typeof raw === 'string') {
    return parseKeywordsInput(raw);
  }

  return [];
}

function toNormalizedString(value: unknown): string {
  return typeof value === 'string' ? normalizeText(value) : '';
}

export function normalizeInspiration(payload: unknown, index = 0): Inspiration | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const theme =
    toNormalizedString(source.theme) ||
    toNormalizedString(source.coreTheme) ||
    toNormalizedString(source.sellingPoint);
  const protagonist = toNormalizedString(source.protagonist) || toNormalizedString(source.hero);
  const worldSetting =
    toNormalizedString(source.worldSetting) ||
    toNormalizedString(source.world_setting) ||
    toNormalizedString(source.world);

  if (!theme && !protagonist && !worldSetting) {
    return null;
  }

  const normalized: Inspiration = {
    name: toNormalizedString(source.name) || toNormalizedString(source.title) || `灵感${index + 1}`,
    theme,
    keywords: normalizeKeywords(source.keywords ?? source.keyword ?? source.tags),
    protagonist,
    worldSetting,
  };

  const hook = toNormalizedString(source.hook);
  if (hook) {
    normalized.hook = hook;
  }

  const potential = toNormalizedString(source.potential);
  if (potential) {
    normalized.potential = potential;
  }

  return normalized;
}

export function normalizeInspirationList(payload: unknown): Inspiration[] {
  const entries =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Array.isArray((payload as { inspirations?: unknown }).inspirations)
        ? (payload as { inspirations: unknown[] }).inspirations
        : [payload]
      : Array.isArray(payload)
        ? payload
        : [];

  const normalized = entries
    .map((item, index) => normalizeInspiration(item, index))
    .filter((item): item is Inspiration => item !== null);

  return normalized;
}
