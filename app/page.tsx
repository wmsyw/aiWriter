import Link from 'next/link';

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute top-20 left-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '0s' }} />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      <main className="relative z-10 container mx-auto px-4 text-center">
        <div className="space-y-8 animate-slide-up">
          <div className="inline-block px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-4">
            <span className="text-sm font-medium text-emerald-300">新一代 AI 写作</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-6">
            创作你的 <br />
            <span className="text-gradient">杰作</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            使用最先进的 AI 辅助小说创作平台释放你的创造力。
            为现代重塑的故事讲述体验。
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/setup" className="btn-primary px-8 py-4 rounded-xl text-lg w-full sm:w-auto">
              开始创作
            </Link>
            <Link href="/login" className="btn-secondary px-8 py-4 rounded-xl text-lg w-full sm:w-auto">
              登录
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="glass-card p-8 rounded-2xl text-left hover:border-emerald-500/30 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h3 className="text-xl font-bold mb-2">智能语境</h3>
            <p className="text-gray-400">AI 能够记住你的角色、情节点和世界观设定。</p>
          </div>
          
          <div className="glass-card p-8 rounded-2xl text-left hover:border-teal-500/30 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-teal-500/20 flex items-center justify-center mb-4 text-teal-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </div>
            <h3 className="text-xl font-bold mb-2">风格匹配</h3>
            <p className="text-gray-400">即时适应你独特的写作声音和叙事风格。</p>
          </div>
          
          <div className="glass-card p-8 rounded-2xl text-left hover:border-amber-500/30 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center mb-4 text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>
            </div>
            <h3 className="text-xl font-bold mb-2">世界构建</h3>
            <p className="text-gray-400">强大的工具来管理复杂的传说、时间线和关系。</p>
          </div>
        </div>
      </main>
    </div>
  );
}
