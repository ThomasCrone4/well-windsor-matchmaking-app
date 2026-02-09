export default function ListSkeleton({ items = 5 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="card">
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-3">
              {/* Title skeleton */}
              <div className="skeleton-shimmer h-5 w-2/3 rounded"></div>
              
              {/* Subtitle skeleton */}
              <div className="skeleton-shimmer h-4 w-1/2 rounded"></div>
              
              {/* Description skeleton */}
              <div className="space-y-2">
                <div className="skeleton-shimmer h-3 w-full rounded"></div>
                <div className="skeleton-shimmer h-3 w-4/5 rounded"></div>
              </div>
            </div>
            
            {/* Action buttons skeleton */}
            <div className="flex gap-2 ml-4">
              <div className="skeleton-shimmer h-8 w-8 rounded-lg"></div>
              <div className="skeleton-shimmer h-8 w-8 rounded-lg"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
