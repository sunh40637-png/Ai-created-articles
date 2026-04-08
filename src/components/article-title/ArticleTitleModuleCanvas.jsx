import { Check, Copy, LoaderCircle, RefreshCw, Sparkles, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatCheckedAt(value) {
  if (!value) {
    return '尚未检查'
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatUpdatedAt(value) {
  if (!value) {
    return '暂无时间'
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function ArticleRow({ article, onSelect, selected }) {
  return (
    <button
      className={cn(
        'w-full rounded-[24px] border px-4 py-4 text-left transition-colors',
        selected ? 'border-primary/25 bg-primary/[0.06]' : 'border-border/70 bg-white hover:border-primary/18 hover:bg-secondary/15',
      )}
      onClick={() => onSelect(article.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-6 text-foreground">{article.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-secondary/25 px-2.5 py-1">{article.theme}</span>
            {article.type ? <span className="rounded-full border border-border/70 bg-secondary/25 px-2.5 py-1">{article.type}</span> : null}
          </div>
        </div>
        {selected ? (
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.08] text-primary">
            <Check size={14} />
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-[12px] text-muted-foreground">更新于 {formatUpdatedAt(article.updatedAt)}</div>
    </button>
  )
}

function EmptyState({ description, title }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-secondary/10 px-6 text-center">
      <div className="max-w-[320px]">
        <div className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">{title}</div>
        <p className="mt-3 text-[14px] leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default function ArticleTitleModuleCanvas({
  articles = [],
  checkedAt = null,
  generatedTitleResult = null,
  hasChecked = false,
  isGenerating = false,
  onApplyGeneratedTitle,
  onCheckArticles,
  onCopyGeneratedTitle,
  onGenerateTitle,
  onSelectArticle,
  selectedArticle = null,
  selectedArticleId = null,
}) {
  const hasGeneratedTitle = Boolean(generatedTitleResult?.title)

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col px-4 py-8 sm:px-5 lg:px-6">
        <div className="flex flex-col gap-5 rounded-[32px] border border-border/70 bg-[linear-gradient(135deg,rgba(245,247,250,0.95),rgba(255,255,255,0.98))] px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-[760px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-[12px] font-medium text-primary">
                <Type size={14} />
                文章标题模块
              </div>
              <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-foreground sm:text-[34px]">根据已排版文章生成新标题</h1>
              <p className="mt-3 max-w-[720px] text-[14px] leading-7 text-muted-foreground">
                点击检查后，系统会拉出当前所有已完成排版确认的文章。选中一篇文章后，可以基于正文内容和标题规则生成 1 个新标题，并支持复制或手动应用为当前标题。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border border-border/70 bg-white px-3 py-1.5 text-[12px] text-muted-foreground">
                最近检查：{formatCheckedAt(checkedAt)}
              </div>
              <Button className="rounded-full" onClick={onCheckArticles} type="button">
                <RefreshCw size={15} />
                检查
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid min-h-0 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="min-h-0 rounded-[32px] border border-border/70 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">已排版文章</div>
                <div className="mt-1 text-[13px] text-muted-foreground">{hasChecked ? `本次检查共 ${articles.length} 篇` : '先点击检查，再显示可用文章列表'}</div>
              </div>
            </div>

            {!hasChecked ? (
              <div className="mt-5">
                <EmptyState description="你点一次检查后，这里才会列出当前已完成排版确认的文章。" title="等待检查" />
              </div>
            ) : articles.length === 0 ? (
              <div className="mt-5">
                <EmptyState description="当前还没有已完成排版确认的文章，所以暂时没有可生成标题的对象。" title="暂无已排版文章" />
              </div>
            ) : (
              <div className="benchmark-scroll-hidden mt-5 max-h-[720px] space-y-3 overflow-y-auto pr-1">
                {articles.map((article) => (
                  <ArticleRow
                    article={article}
                    key={article.id}
                    onSelect={onSelectArticle}
                    selected={article.id === selectedArticleId}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="min-h-0 rounded-[32px] border border-border/70 bg-white p-5 sm:p-6">
            {!hasChecked ? (
              <EmptyState description="检查后再从左侧挑选文章，右侧才会展示正文预览和标题生成区域。" title="等待选择文章" />
            ) : !selectedArticle ? (
              <EmptyState description="左侧点选一篇已排版文章后，这里会显示正文内容预览，以及生成标题的操作区。" title="请选择一篇文章" />
            ) : (
              <div className="flex min-h-0 flex-col gap-5">
                <div className="rounded-[28px] border border-border/70 bg-secondary/10 p-5">
                  <div className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground">当前文章</div>
                  <div className="mt-3 text-[24px] font-semibold leading-[1.5] tracking-[-0.035em] text-foreground">{selectedArticle.title}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="rounded-full border border-border/70 bg-white px-2.5 py-1">{selectedArticle.theme}</span>
                    {selectedArticle.type ? <span className="rounded-full border border-border/70 bg-white px-2.5 py-1">{selectedArticle.type}</span> : null}
                    <span className="rounded-full border border-border/70 bg-white px-2.5 py-1">更新于 {formatUpdatedAt(selectedArticle.updatedAt)}</span>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">正文预览</div>
                      <div className="mt-1 text-[13px] text-muted-foreground">标题生成会基于这篇文章当前已确认的正文内容。</div>
                    </div>
                    <Button className="rounded-full" disabled={isGenerating || !selectedArticle.bodyMarkdown.trim()} onClick={onGenerateTitle} type="button">
                      {isGenerating ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}
                      {isGenerating ? '生成中...' : '生成标题'}
                    </Button>
                  </div>

                  <div className="benchmark-scroll-hidden mt-4 max-h-[320px] overflow-y-auto rounded-[22px] border border-border/70 bg-secondary/10 px-4 py-4">
                    <div className="whitespace-pre-wrap text-[14px] leading-7 text-foreground/86">
                      {selectedArticle.bodyPlainText || '当前文章正文为空，暂时无法生成标题。'}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">AI 输出内容</div>
                      <div className="mt-1 text-[13px] text-muted-foreground">
                        {hasGeneratedTitle ? '这里显示最新一次生成的标题结果。' : '点击“生成标题”后，这里会展示 1 条 AI 生成的新标题。'}
                      </div>
                    </div>
                    {generatedTitleResult?.model ? (
                      <span className="rounded-full border border-border/70 bg-secondary/10 px-2.5 py-1 text-[12px] text-muted-foreground">
                        {generatedTitleResult.model}
                      </span>
                    ) : null}
                  </div>

                  {hasGeneratedTitle ? (
                    <div className="mt-4 rounded-[24px] border border-primary/18 bg-primary/[0.05] p-5">
                      <div className="text-[12px] font-medium tracking-[0.08em] text-primary">生成标题</div>
                      <div className="mt-3 text-[24px] font-semibold leading-[1.6] tracking-[-0.03em] text-foreground">
                        {generatedTitleResult.title}
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Button className="rounded-full" onClick={() => onCopyGeneratedTitle(generatedTitleResult.title)} type="button" variant="outline">
                          <Copy size={15} />
                          复制
                        </Button>
                        <Button className="rounded-full" onClick={() => onApplyGeneratedTitle(selectedArticle.id)} type="button">
                          <Check size={15} />
                          应用为当前标题
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[24px] border border-dashed border-border/80 bg-secondary/10 px-5 py-8 text-center text-[14px] leading-7 text-muted-foreground">
                      还没有生成结果。选中文章后点击上方按钮，就会在这里看到 AI 产出的新标题。
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
