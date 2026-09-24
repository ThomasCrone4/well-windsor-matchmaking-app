// POLISH-9. The picture library organisations choose from when posting a
// role. Admins are the only people who can add to it -- organisations never
// upload -- and, like skills, a picture can be hidden but never deleted.
//
// Writes go through two SECURITY DEFINER functions (admin_add_role_image,
// admin_set_role_image_active), both audited. The file itself goes to the
// public `role-images` bucket, whose only write policy is an admin INSERT:
// there is no UPDATE or DELETE policy, so a file cannot be swapped for
// something else after it is on the list.
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { supabase } from '../../utils/supabase';
import OpportunityPhoto from '../../components/OpportunityPhoto';
import {
  ROLE_IMAGE_BUCKET,
  roleImageSources,
  useRoleImages,
} from '../../utils/opportunityImages';

// Cards render at up to ~520 CSS px, so 1200 covers 2x screens with room.
const MAX_WIDTH = 1200;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // matches the bucket's limit
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Resize in the browser and re-encode as JPEG before upload. Two reasons:
 * a phone photo is 4-8 MB and ten of them would make the browse crawl; and
 * re-encoding through a canvas drops EXIF, which on a phone photo includes
 * the GPS position it was taken at.
 */
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  // A transparent PNG would otherwise turn black in JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not process that image. Try a different file.');
  return blob;
}

async function addImage({ file, alt }) {
  const blob = await prepareImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('That picture is still over 5 MB after resizing. Try a smaller one.');
  }
  const path = `${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(ROLE_IMAGE_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const { error } = await supabase.rpc('admin_add_role_image', {
    p_storage_path: path,
    p_alt: alt,
  });
  if (error) throw error;
}

async function setImageActive(id, active) {
  const { error } = await supabase.rpc('admin_set_role_image_active', {
    p_image_id: id,
    p_active: active,
  });
  if (error) throw error;
}

// The description is the picture's alt text: what a screen reader says on every
// card that uses it. Same 1-200 rule as adding; the function audits old + new.
async function setImageAlt(id, alt) {
  const { error } = await supabase.rpc('admin_set_role_image_alt', {
    p_image_id: id,
    p_alt: alt,
  });
  if (error) throw error;
}

// How many live (not removed) roles use each picture, so hiding one says what
// it leaves behind. An admin reads every role by policy.
async function getUsage() {
  const { data, error } = await supabase
    .from('volunteer_opportunities')
    .select('image_id')
    .is('deleted_at', null)
    .not('image_id', 'is', null);
  if (error) throw error;
  const counts = new Map();
  for (const r of data ?? []) counts.set(r.image_id, (counts.get(r.image_id) ?? 0) + 1);
  return counts;
}

// Module level, not inside the page: a component declared in a render body is
// a new type on every render, and React would remount (and reload) every
// thumbnail whenever anything on the page changed.
function Heading({ children }) {
  return (
    <h3
      className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em]"
      style={{ backgroundColor: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
    >
      {children}
    </h3>
  );
}

// One picture. Editing state is per tile and lives here, so opening one
// description for editing never disturbs another.
function PictureTile({ img, usageText, onToggle, isToggling, onSaveAlt }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(img.alt);
  const [saving, setSaving] = useState(false);
  const inputId = `role-image-alt-${img.id}`;
  const trimmed = draft.trim();

  const start = () => {
    setDraft(img.alt);
    setEditing(true);
  };
  const cancel = () => {
    setDraft(img.alt);
    setEditing(false);
  };
  const save = async (e) => {
    e.preventDefault();
    if (!trimmed || trimmed === img.alt) return;
    setSaving(true);
    try {
      await onSaveAlt(img.id, trimmed);
      setEditing(false);
    } catch {
      // The mutation has already said why; stay open so nothing typed is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <li
      data-role-image-id={img.id}
      className="overflow-hidden rounded-xl"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <div className="aspect-[3/2]">
        <OpportunityPhoto image={roleImageSources(img)} sizes="(min-width: 1024px) 30vw, 90vw" />
      </div>

      {editing ? (
        <form onSubmit={save} className="grid gap-2 p-3">
          <label htmlFor={inputId} className="label">
            Describe it for people who cannot see it
          </label>
          <textarea
            id={inputId}
            className="input"
            rows={3}
            maxLength={200}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
            }}
          />
          <p className="help-text">
            {200 - draft.length} characters left. Changes every card that uses
            this picture.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={saving || !trimmed || trimmed === img.alt}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {img.alt}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {img.static_base ? 'Built-in' : 'Uploaded'} &middot; {usageText(img.id)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={start}>
              Edit description
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={isToggling}
              onClick={() => onToggle(img.id, !img.is_active)}
            >
              {img.is_active ? 'Hide' : 'Restore'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Grid({ list, ...tileProps }) {
  return (
    <ul className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((img) => (
        <PictureTile key={img.id} img={img} {...tileProps} />
      ))}
    </ul>
  );
}

export default function AdminRoleImages() {
  const qc = useQueryClient();
  const { data: images = [], isPending } = useRoleImages();
  const { data: usage = new Map() } = useQuery({
    queryKey: ['admin-role-image-usage'],
    queryFn: getUsage,
    staleTime: 60 * 1000,
  });

  const [file, setFile] = useState(null);
  const [alt, setAlt] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['role-images'] });
    qc.invalidateQueries({ queryKey: ['admin-role-image-usage'] });
  };

  const addMut = useMutation({
    mutationFn: addImage,
    onSuccess: () => {
      toast.success('Picture added to the library');
      setFile(null);
      setAlt('');
      setInputKey((k) => k + 1);
      invalidate();
    },
    onError: (e) => toast.error(e.message || 'Could not add the picture'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }) => setImageActive(id, active),
    onSuccess: (_d, v) => {
      toast.success(v.active ? 'Picture restored' : 'Picture hidden');
      invalidate();
    },
    onError: (e) => toast.error(e.message || 'Could not update the picture'),
  });

  const altMut = useMutation({
    mutationFn: ({ id, alt }) => setImageAlt(id, alt),
    onSuccess: () => {
      toast.success('Description updated');
      invalidate();
      // The browse reads the description through public_opportunities.
      qc.invalidateQueries({ queryKey: ['public_opportunities'] });
    },
    onError: (e) => toast.error(e.message || 'Could not update the description'),
  });

  const onPick = (e) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !ACCEPTED.includes(f.type)) {
      toast.error('Use a JPEG, PNG or WebP picture.');
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!file || !alt.trim()) return;
    addMut.mutate({ file, alt: alt.trim() });
  };

  const active = images.filter((i) => i.is_active);
  const hidden = images.filter((i) => !i.is_active);

  const usageText = (id) => {
    const n = usage.get(id) ?? 0;
    return n ? `Used by ${n} role${n === 1 ? '' : 's'}` : 'Not used by any role';
  };

  return (
    <section className="card">
      <h2 className="section-title mb-2">Role pictures</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        The pictures organisations choose from for their role&rsquo;s card.
        Organisations cannot upload their own &mdash; only what is here.{' '}
        <strong style={{ color: 'var(--color-text-primary)' }}>
          Hiding a picture only stops new choices.
        </strong>{' '}
        Roles that already use it keep it. There is no way to delete one.
        Do not add photographs in which children can be identified unless the
        charity holds written consent from a parent or guardian.
      </p>

      <form onSubmit={submit} className="form-grid md:grid-cols-[1fr_2fr_auto] md:items-end mb-6">
        <div className="form-row">
          <label htmlFor="role-image-file" className="label">Picture</label>
          <input
            key={inputKey}
            id="role-image-file"
            type="file"
            accept={ACCEPTED.join(',')}
            onChange={onPick}
            className="input"
          />
        </div>
        <div className="form-row">
          <label htmlFor="role-image-alt" className="label">
            Describe it for people who cannot see it
          </label>
          <input
            id="role-image-alt"
            className="input"
            value={alt}
            maxLength={200}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="e.g. Volunteers sorting donated books on a long table"
          />
        </div>
        <button
          type="submit"
          className="btn-primary mb-1"
          disabled={addMut.isPending || !file || !alt.trim()}
        >
          {addMut.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {previewUrl && (
        <div className="mb-6 max-w-xs overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
          <img src={previewUrl} alt="The picture you are about to add" className="aspect-[3/2] w-full object-cover" />
        </div>
      )}

      {isPending ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading pictures…</p>
      ) : (
        <div className="grid gap-6">
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            <Heading>Offered to organisations ({active.length})</Heading>
            {active.length ? (
              <Grid list={active} usageText={usageText} onToggle={(id, active) => toggleMut.mutate({ id, active })} isToggling={toggleMut.isPending} onSaveAlt={(id, alt) => altMut.mutateAsync({ id, alt })} />
            ) : (
              <p className="p-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                No pictures offered. Every role will use a general one.
              </p>
            )}
          </div>

          {hidden.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              <Heading>Hidden ({hidden.length})</Heading>
              <p className="px-4 pt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Not offered to anyone posting a role now. Still shown on the
                roles that already chose them.
              </p>
              <Grid list={hidden} usageText={usageText} onToggle={(id, active) => toggleMut.mutate({ id, active })} isToggling={toggleMut.isPending} onSaveAlt={(id, alt) => altMut.mutateAsync({ id, alt })} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
