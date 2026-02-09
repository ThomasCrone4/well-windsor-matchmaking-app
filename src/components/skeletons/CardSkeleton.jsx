export default function CardSkeleton({ count = 3 }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <div className="space-y-3">
            {/* Title skeleton */}
            <div className="skeleton-shimmer h-6 w-3/4 rounded"></div>
            
            {/* Subtitle skeleton */}
            <div className="skeleton-shimmer h-4 w-1/2 rounded"></div>
            
            {/* Content lines */}
            <div className="space-y-2 pt-2">
              <div className="skeleton-shimmer h-4 w-full rounded"></div>
              <div className="skeleton-shimmer h-4 w-5/6 rounded"></div>
              <div className="skeleton-shimmer h-4 w-4/6 rounded"></div>
            </div>
            
            {/* Button skeleton */}
            <div className="pt-2">
              <div className="skeleton-shimmer h-10 w-full rounded-xl"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
