/**
 * 认证页面共用布局。
 * 采用品牌叙事区 + 表单卡片的双栏结构，和聊天页保持统一视觉语言。
 */

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-snow-bg px-4 py-4 sm:px-5">
      <div className="ambient-grid pointer-events-none absolute inset-0" />
      <div className="grain-overlay pointer-events-none absolute inset-0 opacity-70" />

      <div className="relative mx-auto grid min-h-[calc(100dvh-2rem)] max-w-[1380px] gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel-frame relative flex overflow-hidden rounded-[36px] px-6 py-7 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute inset-y-0 right-[-4rem] w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(215,186,125,0.16),transparent_72%)]" />

          <div className="relative flex w-full flex-col justify-between gap-10">
            <div className="max-w-xl">
              <p className="editorial-kicker">Snow / Private Companion</p>
              <h1 className="mt-4 font-display text-[4.2rem] leading-[0.88] text-snow-text-strong sm:text-[5.5rem]">
                Tonight,
                <br />
                stay a little.
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-8 text-snow-muted-strong sm:text-[15px]">
                Snow 不是工具面板，而是一条能持续延伸的私人陪伴线路。
                这里的视觉、节奏和语言，都围绕“夜里有人认真听你说话”来设计。
              </p>
            </div>

            <div className="grid gap-3 text-sm text-snow-muted-strong sm:grid-cols-3">
              <div className="soft-badge">记忆、关系、情绪会持续演化</div>
              <div className="soft-badge">Web 壳只承接 UI，不复制 core 逻辑</div>
              <div className="soft-badge">更像夜间礼宾台，不像普通聊天页</div>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="panel-frame w-full rounded-[32px] px-6 py-7 sm:px-7 sm:py-8">
            <p className="editorial-kicker">Access</p>
            <h2 className="mt-3 font-display text-[2.5rem] leading-none text-snow-text-strong">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-snow-muted">
              {subtitle}
            </p>

            <div className="mt-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
