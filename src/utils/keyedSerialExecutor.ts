export class KeyedSerialExecutor {
  private readonly tails = new Map<string, Promise<void>>();

  public async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let releaseCurrent: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(
      () => current,
      () => current,
    );

    this.tails.set(key, tail);
    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseCurrent?.();

      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
