/** Invalidate outstanding reads when navigation or session changes. */
export class RequestScope {
  private generation = 0;
  next(): () => boolean {
    const generation = ++this.generation;
    return () => this.generation === generation;
  }
  invalidate(): void { ++this.generation; }
}
