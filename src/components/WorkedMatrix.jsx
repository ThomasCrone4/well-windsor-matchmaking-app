// src/components/WorkedMatrix.jsx
import { useState, useEffect, useRef } from 'react';

export default function WorkedMatrix({ value = [], onChange }) {
  const DEFAULT_BLOCK = { days: [], start_date: '', end_date: '', start_time: '', end_time: '' };

  // Local state mirrors `value`, but will resync when `value` changes.
  const [blocks, setBlocks] = useState(
    Array.isArray(value) && value.length ? value : [DEFAULT_BLOCK]
  );

  const didMountRef = useRef(false);

  // On first mount: if parent didn't pass anything, initialize it with one empty block.
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    if (!Array.isArray(value) || value.length === 0) {
      onChange([DEFAULT_BLOCK]); // initialize parent
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 👉 Sync from parent prop: when `value` changes (e.g., after fetching edit data), update local state.
  useEffect(() => {
    if (!Array.isArray(value)) return;
    if (value.length === 0) {
      setBlocks([DEFAULT_BLOCK]);
    } else {
      setBlocks(value);
    }
  }, [value]);

  const handleUpdate = (newBlocks) => {
    setBlocks(newBlocks);
    onChange(newBlocks);
  };

  const addBlock = () => {
    handleUpdate([...blocks, { ...DEFAULT_BLOCK }]);
  };

  const updateBlock = (index, field, val) => {
    const updated = blocks.map((b, i) => {
      if (i !== index) return b;

      const next = { ...b, [field]: val };

      // For worked hours: allow past dates but keep end_date >= start_date when both exist
      if (field === 'start_date') {
        if (next.end_date && next.end_date < val) next.end_date = val;
      }
      if (field === 'end_date') {
        if (next.start_date && val < next.start_date) next.end_date = next.start_date;
      }

      return next;
    });
    handleUpdate(updated);
  };

  const removeBlock = (index) => {
    handleUpdate(blocks.filter((_, i) => i !== index));
  };

  const daysOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  return (
    <div className="stack">
      {blocks.map((block, i) => (
        <div key={i} className="fieldset space-y-3 relative">
          <div className="flex items-center justify-between">
            <span className="legend">Worked Block {i + 1}</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBlock(i)}>
              Remove
            </button>
          </div>

          {/* Days */}
          <div className="form-row">
            <label className="label">Days</label>
            <div className="flex flex-wrap gap-3">
              {daysOfWeek.map((day) => {
                const checked = block.days.includes(day);
                return (
                  <label key={day} className="check-label">
                    <input
                      type="checkbox"
                      className="check"
                      checked={checked}
                      onChange={() => {
                        const updatedDays = checked
                          ? block.days.filter((d) => d !== day)
                          : [...block.days, day];
                        updateBlock(i, 'days', updatedDays);
                      }}
                    />
                    {day}
                  </label>
                );
              })}
            </div>
            <p className="help-text">Tick the days you actually worked.</p>
          </div>

          {/* Date range (past allowed). Keep end ≥ start. */}
          <div className="form-grid sm:grid-cols-2">
            <div className="form-row">
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={block.start_date}
                onChange={(e) => updateBlock(i, 'start_date', e.target.value)}
              />
            </div>
            <div className="form-row">
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={block.end_date}
                min={block.start_date || undefined}
                onChange={(e) => updateBlock(i, 'end_date', e.target.value)}
              />
            </div>
          </div>

          {/* Time range */}
          <div className="form-grid sm:grid-cols-2">
            <div className="form-row">
              <label className="label">Start Time</label>
              <input
                type="time"
                className="input"
                value={block.start_time}
                onChange={(e) => updateBlock(i, 'start_time', e.target.value)}
              />
            </div>
            <div className="form-row">
              <label className="label">End Time</label>
              <input
                type="time"
                className="input"
                value={block.end_time}
                onChange={(e) => updateBlock(i, 'end_time', e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={addBlock}>
          Add Worked Block
        </button>
      </div>
    </div>
  );
}
