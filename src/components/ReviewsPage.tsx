import { useState, useEffect, useCallback } from 'react'
import {
  Star, BookOpen, Gavel, MessageSquare, ChevronDown, ChevronRight,
  RefreshCw, FileText, Calendar, List, Loader
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

// ============================================================
// Types
// ============================================================

interface ReviewSection {
  heading: string
  level: number
  length: number
}

interface Review {
  id: string
  source: 'CURATOR' | 'VERDICT' | 'RECOMMENDATION'
  type: 'synthesis' | 'verdict' | 'recommendation'
  title: string
  summary: string
  sections?: ReviewSection[]
  content: string
  date: string
  file: string
  size: number
  confidence?: number
}

interface ReviewsResponse {
  reviews: Review[]
  count: number
  sources: string[]
}

// ============================================================
// Constants & Helpers
// ============================================================

type SourceFilter = 'ALL' | 'CURATOR' | 'VERDICT' | 'RECOMMENDATION'

const SOURCE_CONFIG = {
  CURATOR: {
    color: 'text-purple-400',
    bg: 'bg-purple-900/30',
    border: 'border-purple-700/50',
    borderLeft: 'border-l-purple-500',
    icon: BookOpen,
    label: 'Curator',
  },
  VERDICT: {
    color: 'text-amber-400',
    bg: 'bg-amber-900/30',
    border: 'border-amber-700/50',
    borderLeft: 'border-l-amber-500',
    icon: Gavel,
    label: 'Verdict',
  },
  RECOMMENDATION: {
    color: 'text-green-400',
    bg: 'bg-green-900/30',
    border: 'border-green-700/50',
    borderLeft: 'border-l-green-500',
    icon: MessageSquare,
    label: 'Recommendation',
  },
} as const

const TYPE_CONFIG: Record<string, { bg: string; text: string }> = {
  synthesis: { bg: 'bg-purple-900/40', text: 'text-purple-300' },
  verdict: { bg: 'bg-amber-900/40', text: 'text-amber-300' },
  recommendation: { bg: 'bg-green-900/40', text: 'text-green-300' },
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================
// Confidence Bar (for CURATOR type)
// ============================================================

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Confidence</span>
      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${textColor}`}>{pct}%</span>
    </div>
  )
}

// ============================================================
// Review Card
// ============================================================

function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false)
  const sourceConfig = SOURCE_CONFIG[review.source]
  const typeStyle = TYPE_CONFIG[review.type] || { bg: 'bg-gray-900/40', text: 'text-gray-300' }
  const SourceIcon = sourceConfig.icon

  return (
    <div
      className={`bg-[#1e2433] border border-gray-700/30 rounded-lg overflow-hidden
        border-l-4 ${sourceConfig.borderLeft}
        hover:border-gray-600/40 transition-colors`}
    >
      <div className="p-4">
        {/* Badges Row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium ${sourceConfig.bg} ${sourceConfig.color} border ${sourceConfig.border}`}>
            <SourceIcon className="w-3 h-3" />
            {sourceConfig.label}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
            {review.type}
          </span>
        </div>

        {/* Title */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-amber-100 flex-1">{review.title}</h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 transition-colors mt-0.5 flex-shrink-0"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Summary */}
        <p className={`text-xs text-gray-300 leading-relaxed mt-2 ${expanded ? '' : 'line-clamp-4'}`}>
          {review.summary}
        </p>

        {/* Sections TOC (when collapsed, show inline) */}
        {!expanded && review.sections && review.sections.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <List className="w-3 h-3 text-gray-500 flex-shrink-0" />
            <span className="text-[10px] text-gray-500">
              {review.sections.length} sections
            </span>
          </div>
        )}

        {/* Confidence bar for CURATOR source */}
        {review.source === 'CURATOR' && review.confidence !== undefined && (
          <div className="mt-3">
            <ConfidenceBar value={review.confidence} />
          </div>
        )}

        {/* Metadata Row */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <Calendar className="w-3 h-3" />
            {formatDate(review.date)}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <FileText className="w-3 h-3" />
            {review.file}
          </span>
          <span className="text-[10px] text-gray-600">
            {formatSize(review.size)}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-700/30 bg-[#161b26]">
          {/* Sections TOC */}
          {review.sections && review.sections.length > 0 && (
            <div className="px-4 pt-3 pb-2 border-b border-gray-700/20">
              <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <List className="w-3 h-3" />
                Table of Contents
              </h4>
              <div className="space-y-1">
                {review.sections.map((section, i) => (
                  <button
                    key={i}
                    className="block text-left w-full group"
                    onClick={() => {
                      const el = document.getElementById(`review-${review.id}-section-${i}`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  >
                    <span
                      className="text-xs text-purple-300 hover:text-purple-200 transition-colors"
                      style={{ paddingLeft: `${(section.level - 1) * 12}px` }}
                    >
                      {section.heading}
                    </span>
                    <span className="text-[10px] text-gray-600 ml-2">
                      ({section.length} chars)
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full Content */}
          <div className="p-4">
            <pre className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono break-words max-h-[500px] overflow-y-auto">
              {review.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Summary Stat Card
// ============================================================

function StatCard({
  icon: Icon,
  label,
  count,
  color,
  bg,
  border,
}: {
  icon: typeof BookOpen
  label: string
  count: number
  color: string
  bg: string
  border: string
}) {
  return (
    <div className={`${bg} border ${border} rounded-lg p-3 flex items-center gap-3`}>
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <div className={`text-lg font-bold ${color}`}>{count}</div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  )
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="absolute -inset-3 bg-purple-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute -inset-1.5 bg-purple-500/5 rounded-full animate-pulse" style={{ animationDuration: '2s' }} />
        <div className="relative w-14 h-14 bg-purple-900/40 border-2 border-purple-600/50 rounded-full flex items-center justify-center shadow-lg shadow-purple-900/30">
          <BookOpen className="w-7 h-7 text-purple-400 animate-pulse" style={{ animationDuration: '3s' }} />
        </div>
      </div>
      <p className="text-sm font-medium text-gray-400 mt-4">
        No reviews yet -- CURATOR is analyzing...
      </p>
      <p className="text-xs text-gray-600 mt-1">
        Synthesis reports and verdicts will appear here as they are generated
      </p>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<SourceFilter>('ALL')

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/labs/reviews`)
      if (res.status === 404) {
        setReviews([])
        return
      }
      if (!res.ok) {
        setReviews([])
        return
      }
      const data: ReviewsResponse = await res.json()
      setReviews(data.reviews || [])
    } catch {
      setReviews([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => loadData(true), 30000)
    return () => clearInterval(interval)
  }, [loadData])

  // Compute counts per source
  const curatorCount = reviews.filter(r => r.source === 'CURATOR').length
  const verdictCount = reviews.filter(r => r.source === 'VERDICT').length
  const recommendationCount = reviews.filter(r => r.source === 'RECOMMENDATION').length

  // Apply filter
  const filteredReviews = filter === 'ALL'
    ? reviews
    : reviews.filter(r => r.source === filter)

  // Sort newest first
  const sortedReviews = [...filteredReviews].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const filterOptions: { key: SourceFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'CURATOR', label: 'Curator' },
    { key: 'VERDICT', label: 'Verdict' },
    { key: 'RECOMMENDATION', label: 'Recommendation' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="w-6 h-6 text-purple-400 animate-spin" />
        <span className="ml-3 text-sm text-gray-400">Loading reviews...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-amber-100 flex items-center gap-2">
            <Star className="w-5 h-5 text-purple-400" />
            Reviews &amp; Synthesis
          </h2>
          {reviews.length > 0 && (
            <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full">
              {reviews.length}
            </span>
          )}
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1e2433] hover:bg-[#252b3b] border border-purple-900/30 rounded-lg text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        {filterOptions.map(opt => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              filter === opt.key
                ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
                : 'bg-[#1e2433] text-gray-400 hover:text-gray-200 border border-gray-700/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={BookOpen}
          label="Curator Reports"
          count={curatorCount}
          color="text-purple-400"
          bg="bg-purple-900/20"
          border="border-purple-700/30"
        />
        <StatCard
          icon={Gavel}
          label="Verdicts"
          count={verdictCount}
          color="text-amber-400"
          bg="bg-amber-900/20"
          border="border-amber-700/30"
        />
        <StatCard
          icon={MessageSquare}
          label="Recommendations"
          count={recommendationCount}
          color="text-green-400"
          bg="bg-green-900/20"
          border="border-green-700/30"
        />
      </div>

      {/* Reviews List */}
      {sortedReviews.length === 0 ? (
        <div className="bg-[#0f1219] border border-purple-900/20 rounded-lg">
          <EmptyState />
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {reviews.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800/50">
          <span>
            {filteredReviews.length} review{filteredReviews.length !== 1 ? 's' : ''} shown
            {filter !== 'ALL' && ` (filtered: ${filter})`}
          </span>
          <span>Auto-refreshes every 30s</span>
        </div>
      )}
    </div>
  )
}
