export const newId = (): string => crypto.randomUUID(); // design.md §2.1 準拠
export const nowDate = (): Date => new Date(); // timestamp_ms 列用
