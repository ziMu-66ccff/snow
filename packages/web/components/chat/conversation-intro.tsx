interface ConversationIntroProps {
  userLabel: string;
}

export function ConversationIntro({ userLabel }: ConversationIntroProps) {
  return (
    <section className="panel-frame relative overflow-hidden rounded-[28px] px-5 py-5 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-[radial-gradient(circle_at_center,rgba(215,186,125,0.12),transparent_70%)]" />

      <p className="editorial-kicker">Tonight&apos;s Room</p>
      <div className="mt-3 space-y-3">
        <h2 className="font-display text-[2rem] leading-none text-snow-text-strong sm:text-[2.6rem]">
          欢迎回来，{userLabel}。
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-snow-muted-strong sm:text-[15px]">
          这里不是效率面板，也不是命令终端。你可以直接聊情绪、工作、犹豫、关系，
          Snow 会带着记忆和自己的语气继续这段对话。
        </p>
      </div>

      <div className="mt-5 grid gap-2 text-xs text-snow-muted sm:grid-cols-3">
        <div className="soft-badge">支持持续记忆与关系变化</div>
        <div className="soft-badge">可以通过侧栏定制对话气质</div>
        <div className="soft-badge">Shift + Enter 换行，回车发送</div>
      </div>
    </section>
  );
}
