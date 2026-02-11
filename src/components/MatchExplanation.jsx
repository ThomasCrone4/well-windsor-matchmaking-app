/**
 * MatchExplanation Component
 * Displays why a match score is what it is
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import MatchScore from './MatchScore';

export default function MatchExplanation({
  matchData,
  showDetails = true,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!matchData) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        No match data available
      </div>
    );
  }

  const {
    matchScore,
    semanticSimilarity,
    skillsSimilarity,
    availabilityMatch,
    explanation,
  } = matchData;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header with score and main explanation */}
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <MatchScore score={matchScore} size="md" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
              {matchScore >= 80
                ? 'Excellent Match!'
                : matchScore >= 60
                  ? 'Good Match'
                  : matchScore >= 40
                    ? 'Possible Match'
                    : 'Low Match'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {explanation}
            </p>
          </div>
        </div>

        {/* Expandable details */}
        {showDetails && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between gap-2 px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Match Breakdown
            </span>
            {isExpanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </button>
        )}
      </div>

      {/* Detailed breakdown */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-3">
          {/* Bio Similarity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Bio Match
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {semanticSimilarity}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all"
                style={{ width: `${semanticSimilarity}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              How well your bio matches this opportunity
            </p>
          </div>

          {/* Skills Similarity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Skills Match
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {skillsSimilarity}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${skillsSimilarity}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              How many required skills you have
            </p>
          </div>

          {/* Availability Match */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Availability
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {availabilityMatch}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full transition-all"
                style={{ width: `${availabilityMatch}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              How well your availability aligns
            </p>
          </div>

          {/* Overall calculation */}
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">Overall Score =</span> 50% Bio + 25% Skills + 25% Availability
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
