/**
 * Snow 命令行聊天脚本
 *
 * 外界只需要维护 messages 数组 + 调 getChatResponse，其余全自动。
 * 这个脚本就是最简单的壳示例。
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as readline from 'node:readline';
import type { ModelMessage } from 'ai';
import { getChatResponse, finalizeSession } from '../src/ai/chat.js';

// ============================================
// 配置
// ============================================

const platformId = process.argv.includes('--user')
  ? process.argv[process.argv.indexOf('--user') + 1]
  : 'zimu';

const platform = 'system';

// ============================================
// 会话状态（CLI 壳自己维护）
// ============================================

/** 对话历史（对齐 AI SDK：包含当前消息） */
const messages: ModelMessage[] = [];

// ============================================
// 主流程
// ============================================

async function main() {
  console.log('');
  console.log('❄️  Snow 命令行聊天');
  console.log(`   用户: ${platformId} (${platform})`);
  console.log('   输入消息后回车发送，Ctrl+C 退出');
  console.log('─'.repeat(40));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function prompt() {
    rl.question('> ', async (input) => {
      const message = input.trim();
      if (!message) { prompt(); return; }

      try {
        // 追加用户消息到 history
        messages.push({ role: 'user', content: message });

        // 调用 Snow（内部自动：身份查询、记忆检索、滑动窗口、异步记忆提取）
        process.stdout.write('Snow: ');
        const { textStream } = await getChatResponse({ platformId, platform, messages });

        // 消费流式回复
        let fullResponse = '';
        for await (const chunk of textStream) {
          process.stdout.write(chunk);
          fullResponse += chunk;
        }
        console.log('\n');

        // 追加 assistant 回复到 history
        messages.push({ role: 'assistant', content: fullResponse });
      } catch (err: any) {
        console.error(`\n❌ 错误: ${err.message}\n`);
      }

      prompt();
    });
  }

  // Ctrl+C 退出：善后（提取剩余记忆 + 持久化摘要）
  rl.on('close', async () => {
    console.log('\n\n   💭 正在保存记忆...');
    try {
      await finalizeSession(platformId, platform);
      console.log('   ✅ 记忆已保存');
    } catch (err: any) {
      console.error(`   ❌ 保存失败: ${err.message}`);
    }
    console.log('\n👋 下次再聊~ \n');
    process.exit(0);
  });

  prompt();
}

main().catch(console.error);
