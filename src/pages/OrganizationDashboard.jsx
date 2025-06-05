import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../utils/supabase'
import { toast } from 'react-hot-toast'
import { useEffect, useState } from 'react'

const OpportunitySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  location: z.string().min(1, 'Location is required'),
  date: z.string().min(1, 'Date is required'),
  contact: z.string().min(1, 'Contact information is required'),
})

export default function OrganizationDashboard() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(OpportunitySchema),
  })

  const [orgId, setOrgId] = useState(null)

  useEffect(() => {
    const fetchOrgId = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user?.id) return toast.error('Could not get user ID')
      setOrgId(userData.user.id)
    }

    fetchOrgId()
  }, [])

  const onSubmit = async (data) => {
    if (!orgId) return toast.error('Organization ID not loaded')

    const { error } = await supabase.from('volunteer_opportunities').insert([
      {
        org_id: orgId,
        title: data.title,
        description: data.description,
        location: data.location,
        date_needed: data.date,
        contact: data.contact,
      },
    ])

    if (error) {
      toast.error(`Insert failed: ${error.message}`)
    } else {
      toast.success('Volunteer opportunity posted!')
      reset()
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Organization Dashboard</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 rounded shadow space-y-4">
        <div>
          <label className="block font-medium">Title</label>
          <input
            type="text"
            {...register('title')}
            className="w-full p-2 border rounded"
          />
          {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Description</label>
          <textarea
            {...register('description')}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block font-medium">Location</label>
          <input
            type="text"
            {...register('location')}
            className="w-full p-2 border rounded"
          />
          {errors.location && <p className="text-red-500 text-sm">{errors.location.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Date</label>
          <input
            type="date"
            {...register('date')}
            className="w-full p-2 border rounded"
          />
          {errors.date && <p className="text-red-500 text-sm">{errors.date.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Preferred Contact Method</label>
          <input
            type="text"
            {...register('contact')}
            className="w-full p-2 border rounded"
            placeholder="e.g. Email me at org@example.com"
          />
          {errors.contact && <p className="text-red-500 text-sm">{errors.contact.message}</p>}
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          Post Opportunity
        </button>
      </form>
    </div>
  )
}
