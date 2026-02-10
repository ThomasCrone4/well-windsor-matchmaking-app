/**
 * MatchScore Component
 * Displays match percentage with visual indicator
 */

export default function MatchScore({ score, size = 'md' }) {
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-blue-600 dark:text-blue-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score) => {
    if (score >= 80) return 'bg-green-50 dark:bg-green-900/20';
    if (score >= 60) return 'bg-blue-50 dark:bg-blue-900/20';
    if (score >= 40) return 'bg-yellow-50 dark:bg-yellow-900/20';
    return 'bg-red-50 dark:bg-red-900/20';
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-12 h-12 text-xs';
      case 'lg':
        return 'w-24 h-24 text-2xl';
      default: // md
        return 'w-16 h-16 text-base';
    }
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Low';
  };

  return (
    <div
      className={`${getSizeClasses()} ${getScoreBgColor(score)} rounded-full flex flex-col items-center justify-center font-bold border-2 ${getScoreColor(score)} border-opacity-30`}
    >
      <span className={getScoreColor(score)}>{Math.round(score)}%</span>
      {size === 'lg' && (
        <span className={`${getScoreColor(score)} text-xs mt-1`}>
          {getScoreLabel(score)}
        </span>
      )}
    </div>
  );
}
