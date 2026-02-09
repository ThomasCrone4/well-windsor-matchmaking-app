export default function FormSkeleton({ fields = 5 }) {
  return (
    <div className="card max-w-2xl mx-auto">
      <div className="space-y-5">
        {/* Title skeleton */}
        <div className="skeleton-shimmer h-8 w-2/3 rounded mx-auto"></div>
        
        {/* Form fields */}
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            {/* Label skeleton */}
            <div className="skeleton-shimmer h-4 w-32 rounded"></div>
            
            {/* Input skeleton */}
            <div className="skeleton-shimmer h-10 w-full rounded-xl"></div>
          </div>
        ))}
        
        {/* Buttons skeleton */}
        <div className="flex gap-3 pt-4">
          <div className="skeleton-shimmer h-10 w-32 rounded-xl"></div>
          <div className="skeleton-shimmer h-10 w-32 rounded-xl"></div>
        </div>
      </div>
    </div>
  );
}
