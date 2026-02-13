import Link from 'next/link';

const features = [
  {
    title: '智能语境',
    desc: '角色、线索、世界观自动关联，长期创作不丢上下文。',
    color: 'emerald',
    icon: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    ),
  },
  {
    title: '风格匹配',
    desc: '根据你的叙事节奏和语言习惯生成更贴近原稿的内容。',
    color: 'sky',
    icon: (
      <>
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </>
    ),
  },
  {
    title: '结构化创作',
    desc: '从设定、纲要到章节、评审形成完整工作流。',
    color: 'amber',
    icon: (
      <>
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path>
      </>
    ),
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute top-20 left-16 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-12 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl animate-float-delayed" />

      <main className="page-shell relative z-10 px-4 py-8 md:py-12">
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="text-zinc-200 font-semibold text-lg tracking-tight">AI Writer</div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost h-9 px-3 text-sm">
              登录
            </Link>
            <Link href="/setup" className="btn-primary h-9 px-4 text-sm">
              立即开始
            </Link>
          </div>
        </header>

        <section className="text-center max-w-4xl mx-auto">
          <div className="inline-flex px-4 py-1.5 rounded-full bg-zinc-900/70 border border-zinc-800 mb-6">
            <span className="text-sm font-medium text-emerald-300">专业小说创作工作台</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.06]">
            把灵感变成
            <span className="text-gradient block mt-1">完整作品</span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            从世界观设定、剧情设计到章节打磨，AI Writer 提供一套可持续、可追踪、可扩展的创作流程。
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/setup" className="btn-primary px-8 h-12 text-base inline-flex items-center justify-center">
              创建工作区
            </Link>
            <Link href="/login" className="btn-secondary px-8 h-12 text-base inline-flex items-center justify-center">
              进入控制台
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-16">
          {features.map((item) => (
            <article key={item.title} className="glass-card rounded-2xl p-6 text-left h-full">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center mb-4 ${
                item.color === 'emerald'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : item.color === 'sky'
                    ? 'bg-sky-500/15 text-sky-400'
                    : 'bg-amber-500/15 text-amber-400'
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {item.icon}
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.desc}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
