const RECENT_IDEMP_CAP = 1024;

/** 冪等キーの二段ストア（メモリ + DO storage）。D1 unique は flush 側が担う。 */
export class IdempotencyStore {
  private recent = new Set<string>();

  constructor(private storage: DurableObjectStorage) {}

  async isApplied(key: string, storageKey: string): Promise<boolean> {
    if (this.recent.has(key)) return true;
    return (await this.storage.get(storageKey)) != null;
  }

  async markApplied(key: string, storageKey: string): Promise<void> {
    this.recent.add(key);
    if (this.recent.size > RECENT_IDEMP_CAP) {
      const first = this.recent.values().next().value;
      if (first) this.recent.delete(first);
    }
    await this.storage.put(storageKey, { at: Date.now() });
  }
}
