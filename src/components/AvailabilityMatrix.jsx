import { useState, useEffect } from 'react';

export default function AvailabilityMatrix({ value = [], onChange }) {
  const [blocks, setBlocks] = useState(
    Array.isArray(value) && value.length
      ? value
      : [{ days: [], start_date: '', end_date: '', start_time: '', end_time: '' }]
  );

  useEffect(() => {
    // Initialize parent form with one empty block if none provided
    if (!value || value.length === 0) {
      onChange(blocks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = (newBlocks) => {
    setBlocks(newBlocks);
    onChange(newBlocks);
  };

  const addBlock = () => {
    handleUpdate([
      ...blocks,
      { days: [], start_date: '', end_date: '', start_time: '', end_time: '' },
    ]);
  };

  const updateBlock = (index, field, val) => {
    const updated = blocks.map((b, i) => (i === index ? { ...b, [field]: val } : b));
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
            <span className="legend">Availability Block {i + 1}</span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => removeBlock(i)}
            >
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
            <p className="help-text">Pick one or more days.</p>
          </div>

          {/* Date range */}
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
          Add Availability Block
        </button>
      </div>
    </div>
  );
}
