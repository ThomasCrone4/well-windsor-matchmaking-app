export default function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead className="thead">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="th">
                <div className="skeleton-shimmer h-4 w-24 rounded"></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="tr-hover">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="td">
                  <div className="skeleton-shimmer h-4 w-32 rounded"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
