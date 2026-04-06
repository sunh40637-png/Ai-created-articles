import { cn } from '@/lib/utils'

const ARTICLE_LIST_STATUS_META = {
  preview: {
    label: '已确认文字稿',
    className: 'border border-amber-200/80 bg-amber-50 text-amber-700',
  },
  completed: {
    label: '已排版',
    className: 'border border-emerald-200/80 bg-emerald-50 text-emerald-700',
  },
}

function getArticleListStatusMeta(stageId = 'preview') {
  return ARTICLE_LIST_STATUS_META[stageId] ?? ARTICLE_LIST_STATUS_META.preview
}

function ArticleListRow({ article, onOpen }) {
  const statusMeta = getArticleListStatusMeta(article.stageId)

  return (
    <button
      className="flex w-full items-center gap-4 border-b border-border/70 px-2 py-4 text-left transition-colors hover:bg-secondary/20"
      onClick={() => onOpen(article.id)}
      type="button"
    >
      <div className="min-w-0 flex-1 text-[15px] font-medium leading-7 text-foreground">
        <span className="block truncate">{article.title}</span>
      </div>
      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px]', statusMeta.className)}>{statusMeta.label}</span>
      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{article.theme}</span>
    </button>
  )
}

export default function ArticlesModuleCanvas({ articles, onOpenArticle }) {
  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-8">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">文章列表</h1>
          <div className="mt-4 inline-flex rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
            创作中 {articles.length} 篇
          </div>
        </div>

        <section>
          <div className="mb-3 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">创作中</div>

          {articles.length === 0 ? (
            <div className="border-t border-border/70 py-16 text-center text-[14px] text-muted-foreground">
              暂无已确认文字稿的文章
            </div>
          ) : (
            <div className="border-t border-border/70">
              {articles.map((article) => (
                <ArticleListRow article={article} key={article.id} onOpen={onOpenArticle} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
