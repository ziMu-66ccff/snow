/**
 * 记忆鲜活度模型
 * 来源：doc/tech/modules/memory-system.md § 三
 *
 * 鲜活度 = 基础重要性 × 时间衰减 × 强化系数 × 情感加成 × 关系加成
 */

interface MemoryForVividness {
  importance: number;
  emotionalIntensity: number;
  accessCount: number;
  createdAt: Date;
}

interface RelationForVividness {
  intimacyScore: number;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * 计算一条语义记忆的鲜活度
 *
 * 返回值 0-N（通常 0~2），越高越容易被"想起来"
 * 保底 0.05 × 其他系数，确保旧记忆可被话题唤醒
 *
 * @param now - 当前时间，默认 new Date()。测试时可注入固定时间。
 */
export function memoryVividness(
  memory: MemoryForVividness,
  relation: RelationForVividness,
  now: Date = new Date(),
): number {
  // 1. 基础重要性（LLM 写入时评估，0-1）
  const importance = memory.importance;

  // 2. 时间衰减（指数衰减）
  //    半衰期：普通记忆 30 天，重要记忆 180 天
  const halfLife = importance > 0.7 ? 180 : 30;
  const days = daysBetween(memory.createdAt, now);
  const timeDecay = Math.exp(-0.693 * days / halfLife);
  //    最低保底 0.05 — 再久也不会完全归零（可唤醒）
  const decay = Math.max(0.05, timeDecay);

  // 3. 强化系数（被想起的次数越多，记忆越牢）
  const reinforcement = 1 + 0.3 * Math.log(1 + memory.accessCount);

  // 4. 情感加成（伴随强烈情感的记忆更深刻）
  const emotionBoost = 1 + (memory.emotionalIntensity || 0) * 0.5;

  // 5. 关系加成（对亲密的人记得更多）
  const relationBoost = 1 + (relation.intimacyScore / 100) * 0.3;

  return importance * decay * reinforcement * emotionBoost * relationBoost;
}
