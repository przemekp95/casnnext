type Props = React.ImgHTMLAttributes<HTMLImageElement>;

/**
 * Prosty <img> komponent bez klientowej logiki.
 * Renderuje się identycznie na serwerze i kliencie.
 */
export default function SafeImage({
  src = '',
  alt = '',
  ...rest
}: Props) {
  return <img src={String(src)} alt={alt} {...rest} />;
}