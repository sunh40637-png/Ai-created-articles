import { cn } from '@/lib/utils'
import { CONTENT_TOPIC_LIBRARY } from '@/stores/useBenchmarkStore.js'

const TOPIC_STATUS_META = {
  completed: {
    label: '已创作',
    className: 'border border-emerald-200/80 bg-emerald-50 text-emerald-700',
  },
  'in-progress': {
    label: '创作中',
    className: 'border border-amber-200/80 bg-amber-50 text-amber-700',
  },
  pending: {
    label: '待创作',
    className: 'bg-secondary text-muted-foreground',
  },
}

function getTopicStatusMeta(status = 'pending') {
  return TOPIC_STATUS_META[status] ?? TOPIC_STATUS_META.pending
}

function TopicLibraryCard({ topic, topicStatus = 'pending' }) {
  const topicStatusMeta = getTopicStatusMeta(topicStatus)

  return (
    <article className="rounded-[20px] border border-border/70 bg-white px-5 py-5 transition-all hover:border-foreground/15 hover:bg-secondary/25">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-[1.55] text-foreground">{topic.title}</div>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{topic.reason}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px]', topicStatusMeta.className)}>{topicStatusMeta.label}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.penName}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.theme}</span>
      </div>
    </article>
  )
}

export default function LibraryModuleCanvas({ topicStatusById }) {
  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-6">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">选题库</h1>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
            当前选题状态会和创作流程联动，已创作或创作中的选题会在这里同步标记。
          </p>
          <div className="mt-4 inline-flex rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
            当前预置 {CONTENT_TOPIC_LIBRARY.length} 个选题
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONTENT_TOPIC_LIBRARY.map((topic) => (
            <TopicLibraryCard key={topic.id} topic={topic} topicStatus={topicStatusById[topic.id] ?? 'pending'} />
          ))}
        </div>
      </div>
    </div>
  )
}
