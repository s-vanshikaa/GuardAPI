interface StatGridSkeletonProps {
  loadingLabel: string
}

export function StatGridSkeleton({ loadingLabel }: StatGridSkeletonProps) {
  return (
    <>
      <p className="loading-caption">{loadingLabel}</p>
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card stat-card">
            <span className="skeleton skeleton-line skeleton-line--label" />
            <span className="skeleton skeleton-stat-value" />
          </div>
        ))}
      </div>
    </>
  )
}
