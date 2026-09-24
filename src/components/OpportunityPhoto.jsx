// The photograph at the top of an opportunity card, and the thumbnails in the
// picker and the admin library. One component, because they take the same
// picture from the same rule -- two near-identical JSX blocks differing only
// in indentation is exactly how the logged-out browse once broke.
//
// The alt text describes the picture rather than being empty: it is chosen
// from a library, NOT a photograph of this role, and a screen reader user who
// heard the title read as a caption for it would be misled.
//
// Pass `image` (a resolved source from opportunityImages.js).
export default function OpportunityPhoto({ image, className = '', sizes }) {
  return (
    <picture>
      {image.srcSetWebp && (
        <source type="image/webp" srcSet={image.srcSetWebp} sizes={sizes} />
      )}
      <img
        src={image.src}
        srcSet={image.srcSetJpeg}
        sizes={image.srcSetJpeg ? sizes : undefined}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    </picture>
  );
}
