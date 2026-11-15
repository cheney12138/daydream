/**
 * 项目名归一化：domain 层唯一约定 —— 路径取尾段。
 *
 * claude-mem 的 project 字段存在两种形态：
 *   '-Users-qianyuchen-work-honour'  → dash 连接的绝对路径（首个 '-' 即路径起始的 '/'）
 *   'chain-review'                   → 已经是裸名（含 '-' 的普通名字，不能切！）
 *   '/Users/qianyuchen/work/honour'  → 原生路径
 *
 * 规则：
 *   1. 含 '/'：取最后一个非空段；
 *   2. 以 '-' 开头（dash 路径形态）：按 '-' 切分取最后一个非空段；
 *   3. 其余（含 'chain-review' 这类普通名）：原样保留。
 * 多个原始名归一到同一尾段时由 usecase 层合并去重。
 */
export function normalizeProject(raw: string): string {
  const name = raw.trim();
  if (!name) return 'unknown';
  if (name.includes('/')) {
    const parts = name.split('/').filter((p) => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1]! : name;
  }
  if (name.startsWith('-')) {
    const parts = name.split('-').filter((p) => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1]! : name;
  }
  return name;
}
