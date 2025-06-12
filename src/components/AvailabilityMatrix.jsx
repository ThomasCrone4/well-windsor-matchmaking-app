import { useState } from 'react'

export default function AvailabilityMatrix({ value = [], onChange }) {
  const [blocks, setBlocks] = useState(value)

  const handleUpdate = (newBlocks) => {
    setBlocks(newBlocks)
    onChange(newBlocks)
  }

  const addBlock = () => {
    const newBlocks = [...blocks, {
      days: [],
      start_date: '',
      end_date: '',
      start_time: '',
      end_time: ''
    }]
    handleUpdate(newBlocks)
  }

  const updateBlock = (index, field, val) => {
    const updated = blocks.map((b, i) =>
      i === index ? { ...b, [field]: val } : b
    )
    handleUpdate(updated)
  }

  const removeBlock = (index) => {
    const updated = blocks.filter((_, i) => i !== index)
    handleUpdate(updated)
  }

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <div key={i} className="p-4 border rounded space-y-2">
          <div>
            <label className="block font-semibold">Days:</label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map(day => (
                <label key={day} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={block.days.includes(day)}
                    onChange={() => {
                      const updatedDays = block.days.includes(day)
                        ? block.days.filter(d => d !== day)
                        : [...block.days, day]
                      updateBlock(i, 'days', updatedDays)
                    }}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <input type="date" className="input" value={block.start_date} onChange={e => updateBlock(i, 'start_date', e.target.value)} />
            <input type="date" className="input" value={block.end_date} onChange={e => updateBlock(i, 'end_date', e.target.value)} />
          </div>
          <div className="flex gap-2">
            <input type="time" className="input" value={block.start_time} onChange={e => updateBlock(i, 'start_time', e.target.value)} />
            <input type="time" className="input" value={block.end_time} onChange={e => updateBlock(i, 'end_time', e.target.value)} />
          </div>
          <button type="button" className="text-red-500 underline" onClick={() => removeBlock(i)}>Remove Block</button>
        </div>
      ))}
      <button type="button" className="bg-blue-500 text-white px-3 py-1 rounded" onClick={addBlock}>
        Add Availability Block
      </button>
    </div>
  )
}
