// The photograph at the top of an opportunity card, and the banner on the
// detail page. One component for both, because they take the same picture
// from the same rule -- two near-identical JSX blocks differing only in
// indentation is exactly how the logged-out browse once broke.
//
// The image is decorative in a card whose title says the same thing, but
// the alt text describes the picture rather than being empty: the category
// fallback is NOT a picture of this role, and a screen reader user who
// heard the title read as a caption for it would be misled.
import { opportunityImage } from '../utils/opportunityImages';

export default function OpportunityPhoto({ category, id, className = '', sizes }) {
  const image = opportunityImage(category, id);

  return (
    <picture>
      <source type="image/webp" srcSet={image.srcSetWebp} sizes={sizes} />
      <img
        src={image.src}
        srcSet={image.srcSetJpeg}
        sizes={sizes}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    </picture>
  );
}
