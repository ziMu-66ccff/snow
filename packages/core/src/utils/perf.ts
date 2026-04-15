/**
 * 极简性能计时工具
 *
 * 用于开发阶段定位链路瓶颈。
 * 仅在 DEBUG_PERF=1 时输出，生产环境静默。
 *
 * @example
 * ```ts
 * const t = createTimer('记忆检索');
 * const result = await retrieveMemories(...);
 * t.end(); // ⏱ [记忆检索] 234ms
 * ```
 */

const enabled = () => process.env.DEBUG_PERF === '1';

/**
 * 创建一个计时器，调用 `.end()` 时输出耗时。
 *
 * @param label - 计时标签，会显示在日志里
 * @returns 带 `end()` 方法的计时器对象
 */
export function createTimer(label: string) {
  const start = performance.now();
  return {
    /** 结束计时并输出耗时（ms），返回耗时数值 */
    end(): number {
      const ms = Math.round(performance.now() - start);
      if (enabled()) {
        console.log(`⏱ [${label}] ${ms}ms`);
      }
      return ms;
    },
  };
}
