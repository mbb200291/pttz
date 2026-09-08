export class ArticleViewState {
  readonly revisions = new Map<string, number>();
  activeArticleId: string | null = null;
  requestGeneration = 0;
  sessionUserId: string | null = null;

  begin(articleId: string): number {
    this.activeArticleId = articleId;
    return ++this.requestGeneration;
  }

  isCurrent(articleId: string, generation: number): boolean {
    return this.activeArticleId === articleId && this.requestGeneration === generation;
  }

  accept(articleId: string, revision: number): boolean {
    if (this.activeArticleId !== articleId || revision <= (this.revisions.get(articleId) ?? -1)) {
      return false;
    }
    this.revisions.set(articleId, revision);
    return true;
  }

  resetSession(): void {
    ++this.requestGeneration;
    this.activeArticleId = null;
    this.revisions.clear();
  }

  changeSession(userId: string | null): boolean {
    if (userId === this.sessionUserId) return false;
    this.sessionUserId = userId;
    this.resetSession();
    return true;
  }

  captureWrite(articleId: string, replyId: string): {
    articleId: string;
    replyId: string;
    epoch: number;
  } {
    return { articleId, replyId, epoch: this.requestGeneration };
  }

  shouldReloadAfterWrite(capture: { articleId: string; epoch: number }): boolean {
    return this.isCurrent(capture.articleId, capture.epoch);
  }
}
